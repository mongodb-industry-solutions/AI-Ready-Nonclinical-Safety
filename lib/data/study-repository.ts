import type { StudyEvidence } from '@/lib/contracts';
import { demoEvidence } from '@/lib/data/demo';
import { solutionDatabase } from '@/lib/data/mongodb';

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

async function evidenceCollection() {
  const database = await solutionDatabase();
  if (!database) return null;
  const collection = database.collection<StudyEvidenceDocument>('study_evidence');
  await collection.createIndexes([
    { key: { 'study.id': 1, 'study.snapshotId': 1 }, name: 'study_snapshot', unique: true },
    { key: { 'signals.organ': 1, 'signals.reviewPriority': 1 }, name: 'signal_review' },
  ]);
  return collection;
}

export async function bootstrapDemoEvidence(): Promise<boolean> {
  const database = await solutionDatabase();
  if (!database) return false;
  const collection = await evidenceCollection();
  if (!collection) return false;
  await collection.updateOne(
    { 'study.id': demoEvidence.study.id, 'study.snapshotId': demoEvidence.study.snapshotId },
    {
      $setOnInsert: {
        ...demoEvidence,
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
        correlatedLab: signal.correlatedLab,
      },
    })),
    ...Object.entries(demoEvidence.labSeries).map(([testCode, series]) => ({
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

export async function loadStudyEvidence(studyId?: string): Promise<StudyEvidence> {
  const collection = await evidenceCollection();
  if (!collection) return demoEvidence;

  await bootstrapDemoEvidence();
  const stored = await collection.findOne(
    studyId ? { 'study.id': studyId } : {},
    { projection: { _id: 0, importedAt: 0, importSource: 0 }, sort: { importedAt: -1 } },
  );
  return stored ? (stored as unknown as StudyEvidence) : demoEvidence;
}
