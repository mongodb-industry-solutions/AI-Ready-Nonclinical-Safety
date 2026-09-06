import type { DataQueryTrace, StudyEvidence } from '@/lib/contracts';
import { demoEvidence } from '@/lib/data/demo';
import { solutionDatabase } from '@/lib/data/mongodb';
import { summarizeMongoExplain } from '@/lib/data/mongodb-explain';
import { portfolioBenchmarks } from '@/lib/data/portfolio-benchmarks';

type StudyEvidenceDocument = StudyEvidence & {
  importedAt: Date;
  importSource: 'bundled-demo' | 'kehrnel-export' | 'solution-api';
};

type StudySnapshotPointer = {
  _id: string;
  studyId: string;
  activeSnapshotId: string;
};

type EvidenceChunk = {
  chunkId: string;
  studyId: string;
  snapshotId: string;
  domain: string;
  text: string;
  sourceRef: string;
  metadata: Record<string, unknown>;
};

const PREFERRED_ATLAS_STUDY_ID = process.env.DEFAULT_STUDY_ID || 'PDS2014';

function importedAtValue(document: Pick<StudyEvidenceDocument, 'importedAt'>) {
  const value = document.importedAt instanceof Date ? document.importedAt.getTime() : new Date(document.importedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function selectActiveStudyEvidence(
  documents: StudyEvidenceDocument[],
  pointers: ReadonlyMap<string, string>,
): StudyEvidenceDocument[] {
  const grouped = new Map<string, StudyEvidenceDocument[]>();
  for (const document of documents) {
    const group = grouped.get(document.study.id) || [];
    group.push(document);
    grouped.set(document.study.id, group);
  }
  return [...grouped.values()].map((versions) => {
    const activeSnapshotId = pointers.get(versions[0].study.id);
    return versions.find((document) => document.study.snapshotId === activeSnapshotId)
      || [...versions].sort((left, right) => importedAtValue(right) - importedAtValue(left))[0];
  }).sort((left, right) => left.study.id.localeCompare(right.study.id));
}

export class StudyEvidenceNotFoundError extends Error {
  constructor(public readonly studyId: string) {
    super(`Study ${studyId} was not found`);
    this.name = 'StudyEvidenceNotFoundError';
  }
}

async function evidenceCollection(ensureIndexes = false) {
  const database = await solutionDatabase();
  if (!database) return null;
  const collection = database.collection<StudyEvidenceDocument>('study_evidence');
  if (ensureIndexes) {
    await collection.createIndexes([
      { key: { 'study.id': 1, 'study.snapshotId': 1 }, name: 'study_snapshot', unique: true },
      { key: { 'signals.organ': 1, 'signals.reviewPriority': 1 }, name: 'signal_review' },
    ]);
  }
  return collection;
}

export async function bootstrapDemoEvidence(): Promise<boolean> {
  const database = await solutionDatabase();
  if (!database) return false;
  const collection = await evidenceCollection(true);
  if (!collection) return false;
  await collection.updateOne(
    { 'study.id': demoEvidence.study.id, 'study.snapshotId': demoEvidence.study.snapshotId },
    {
      $setOnInsert: {
        ...demoEvidence,
        study: { ...demoEvidence.study, evidenceClass: 'observed-public' as const },
        importedAt: new Date(),
        importSource: 'bundled-demo' as const,
      },
    },
    { upsert: true },
  );

  const chunks = database.collection<EvidenceChunk>('evidence_chunks');
  await chunks.createIndex(
    { studyId: 1, snapshotId: 1, domain: 1, chunkId: 1 },
    { name: 'evidence_identity', unique: true },
  );
  const evidenceChunks: EvidenceChunk[] = [
    ...demoEvidence.signals.map((signal) => ({
      chunkId: `MI:${signal.id}`,
      studyId: demoEvidence.study.id,
      snapshotId: demoEvidence.study.snapshotId,
      domain: 'MI',
      text: `${signal.organ}: ${signal.finding}. Pattern ${signal.pattern}; ${signal.affectedAnimals} of ${signal.totalAnimals} animals affected.`,
      sourceRef: `${demoEvidence.study.snapshotId}:MI:${signal.id}`,
      metadata: {
        organ: signal.organ,
        finding: signal.finding,
        incidence: signal.incidence,
        severity: signal.severity,
        ...(signal.correlatedLab ? { correlatedLab: signal.correlatedLab } : {}),
      },
    })),
    ...Object.entries(demoEvidence.labSeries || {}).map(([testCode, series]) => ({
      chunkId: `LB:${testCode}`,
      studyId: demoEvidence.study.id,
      snapshotId: demoEvidence.study.snapshotId,
      domain: 'LB',
      text: `${series.label} (${testCode}) longitudinal group means in ${series.unit}.`,
      sourceRef: `${demoEvidence.study.snapshotId}:LB:${testCode}`,
      metadata: { testCode, unit: series.unit, points: series.points },
    })),
  ];
  if (evidenceChunks.length) {
    await chunks.bulkWrite(
      evidenceChunks.map((chunk) => ({
        updateOne: {
          filter: {
            studyId: chunk.studyId,
            snapshotId: chunk.snapshotId,
            chunkId: chunk.chunkId,
          },
          update: { $setOnInsert: chunk },
          upsert: true,
        },
      })),
    );
  }
  return true;
}

export async function loadStudyEvidence(studyId?: string, onQuery?: (trace: DataQueryTrace) => void): Promise<StudyEvidence> {
  const startedAt = Date.now();
  const collection = await evidenceCollection();
  if (!collection) {
    const matchesPortableStudy = !studyId || studyId === demoEvidence.study.id;
    onQuery?.({ id: 'study-evidence', source: 'portable-bundle', collection: 'study_evidence', operation: 'fixture-read', predicate: studyId ? { 'study.id': studyId } : { 'study.id': demoEvidence.study.id }, status: 'fallback', resultCount: matchesPortableStudy ? 1 : 0, durationMs: Date.now() - startedAt });
    if (!matchesPortableStudy) throw new StudyEvidenceNotFoundError(studyId);
    return demoEvidence;
  }

  const selectedStudyId = studyId || PREFERRED_ATLAS_STUDY_ID;
  const database = await solutionDatabase();
  const pointerStartedAt = Date.now();
  const pointer = await database?.collection<StudySnapshotPointer>('study_snapshot_pointers').findOne({ _id: selectedStudyId });
  onQuery?.({ id: 'active-study-snapshot', source: 'mongodb', collection: 'study_snapshot_pointers', operation: 'findOne', predicate: { _id: selectedStudyId }, status: 'executed', resultCount: pointer ? 1 : 0, durationMs: Date.now() - pointerStartedAt });
  const query = pointer?.activeSnapshotId
    ? { 'study.id': selectedStudyId, 'study.snapshotId': pointer.activeSnapshotId }
    : { 'study.id': selectedStudyId };
  let executedQuery = query;
  let stored = await collection.findOne(
    query,
    { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
  );
  if (!stored && !studyId) {
    executedQuery = { 'study.id': demoEvidence.study.id };
    stored = await collection.findOne(
      executedQuery,
      { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
    );
  }
  if (!stored && !studyId) {
    await bootstrapDemoEvidence();
    stored = await collection.findOne(
      executedQuery,
      { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
    );
  }
  const durationMs = Date.now() - startedAt;
  let plan: DataQueryTrace['plan'];
  if (onQuery) {
    try {
      plan = summarizeMongoExplain(await collection.find(executedQuery, { projection: { _id: 0, importedAt: 0, importSource: 0 } }).sort({ importedAt: -1 }).limit(1).explain('executionStats'), stored ? 1 : 0);
    } catch {
      // Reading the study projection does not depend on explain privileges.
    }
  }
  onQuery?.({ id: 'study-evidence', source: 'mongodb', collection: 'study_evidence', operation: 'findOne', predicate: executedQuery, status: 'executed', resultCount: stored ? 1 : 0, durationMs, ...(plan ? { plan } : {}) });
  if (stored) return stored as unknown as StudyEvidence;
  if (studyId) throw new StudyEvidenceNotFoundError(studyId);
  return demoEvidence;
}

export async function loadPortfolioEvidence(onQuery?: (trace: DataQueryTrace) => void): Promise<StudyEvidence[]> {
  const collection = await evidenceCollection();
  if (!collection) {
    const portable = [{ ...demoEvidence, study: { ...demoEvidence.study, evidenceClass: 'observed-public' as const } }, ...portfolioBenchmarks];
    onQuery?.({ id: 'portfolio-evidence', source: 'portable-bundle', collection: 'study_evidence', operation: 'fixture-read', predicate: {}, status: 'fallback', resultCount: portable.length, durationMs: 0 });
    return portable;
  }

  await bootstrapDemoEvidence();
  const database = await solutionDatabase();
  const pointerStartedAt = Date.now();
  const pointerDocuments = database
    ? await database.collection<StudySnapshotPointer>('study_snapshot_pointers').find({}).toArray()
    : [];
  onQuery?.({ id: 'active-study-snapshots', source: 'mongodb', collection: 'study_snapshot_pointers', operation: 'find', predicate: {}, status: 'executed', resultCount: pointerDocuments.length, durationMs: Date.now() - pointerStartedAt });
  const pointers = new Map(pointerDocuments.map((item) => [item.studyId, item.activeSnapshotId]));
  const evidenceStartedAt = Date.now();
  const versions = await collection.find(
    {},
    { projection: { _id: 0 }, sort: { 'study.id': 1, importedAt: -1 } },
  ).toArray() as unknown as StudyEvidenceDocument[];
  let plan: DataQueryTrace['plan'];
  if (onQuery) {
    try {
      plan = summarizeMongoExplain(await collection.find({}, { projection: { _id: 0 } }).sort({ 'study.id': 1, importedAt: -1 }).explain('executionStats'), versions.length);
    } catch {
      // Portfolio selection remains usable when explain is unavailable.
    }
  }
  onQuery?.({ id: 'portfolio-evidence', source: 'mongodb', collection: 'study_evidence', operation: 'find', predicate: { selection: 'active-snapshot-pointer-or-latest' }, status: 'executed', resultCount: versions.length, durationMs: Date.now() - evidenceStartedAt, ...(plan ? { plan } : {}) });
  const stored = selectActiveStudyEvidence(versions, pointers).map((document) => {
    const evidence: Partial<StudyEvidenceDocument> = { ...document };
    delete evidence.importedAt;
    delete evidence.importSource;
    return evidence as StudyEvidence;
  });
  const identities = new Set(stored.map((item) => `${item.study.id}:${item.study.snapshotId}`));
  const benchmarks = portfolioBenchmarks.filter((item) => !identities.has(`${item.study.id}:${item.study.snapshotId}`));
  return [...stored.map((item) => ({ ...item, study: { ...item.study, evidenceClass: item.study.evidenceClass || (item.study.id === demoEvidence.study.id ? 'observed-public' : 'sponsor-observed') } })), ...benchmarks];
}
