import type { DataQueryTrace, StudyEvidence } from '@/lib/contracts';
import { demoEvidence } from '@/lib/data/demo';
import { solutionDatabase } from '@/lib/data/mongodb';
import { portfolioBenchmarks } from '@/lib/data/portfolio-benchmarks';

type StudyEvidenceDocument = StudyEvidence & {
  importedAt: Date;
  importSource: 'bundled-demo' | 'kehrnel-export' | 'solution-api';
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

  const query = studyId
    ? { 'study.id': studyId }
    : { 'study.id': demoEvidence.study.id, 'study.snapshotId': demoEvidence.study.snapshotId };
  let stored = await collection.findOne(
    query,
    { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
  );
  if (!stored && !studyId) {
    stored = await collection.findOne(
      { 'study.id': demoEvidence.study.id },
      { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
    );
  }
  if (!stored && !studyId) {
    await bootstrapDemoEvidence();
    stored = await collection.findOne(
      { 'study.id': demoEvidence.study.id },
      { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
    );
  }
  onQuery?.({ id: 'study-evidence', source: 'mongodb', collection: 'study_evidence', operation: 'findOne', predicate: query, status: 'executed', resultCount: stored ? 1 : 0, durationMs: Date.now() - startedAt });
  if (stored) return stored as unknown as StudyEvidence;
  if (studyId) throw new StudyEvidenceNotFoundError(studyId);
  return demoEvidence;
}

export async function loadPortfolioEvidence(): Promise<StudyEvidence[]> {
  const collection = await evidenceCollection();
  if (!collection) return [{ ...demoEvidence, study: { ...demoEvidence.study, evidenceClass: 'observed-public' } }, ...portfolioBenchmarks];

  await bootstrapDemoEvidence();
  const stored = await collection.find(
    {},
    { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { 'study.id': 1 } },
  ).toArray() as unknown as StudyEvidence[];
  const identities = new Set(stored.map((item) => `${item.study.id}:${item.study.snapshotId}`));
  const benchmarks = portfolioBenchmarks.filter((item) => !identities.has(`${item.study.id}:${item.study.snapshotId}`));
  return [...stored.map((item) => ({ ...item, study: { ...item.study, evidenceClass: item.study.evidenceClass || (item.study.id === demoEvidence.study.id ? 'observed-public' : 'sponsor-observed') } })), ...benchmarks];
}
