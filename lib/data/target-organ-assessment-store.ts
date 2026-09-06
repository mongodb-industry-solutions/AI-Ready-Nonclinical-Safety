import { createHash } from 'node:crypto';
import type { TargetOrganAssessmentRecord } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';

const inMemoryAssessments: TargetOrganAssessmentRecord[] = [];

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function recordTargetOrganAssessment(
  record: Omit<TargetOrganAssessmentRecord, 'id' | 'createdAt' | 'assessmentDigest'>,
): Promise<TargetOrganAssessmentRecord> {
  const createdAt = new Date().toISOString();
  const assessmentDigest = `sha256:${createHash('sha256').update(stable({ ...record, createdAt })).digest('hex')}`;
  const database = await solutionDatabase();
  if (!database) {
    const saved = { ...record, id: `local-${crypto.randomUUID()}`, createdAt, assessmentDigest };
    inMemoryAssessments.unshift(saved);
    return saved;
  }
  const collection = database.collection<Omit<TargetOrganAssessmentRecord, 'id'>>('target_organ_assessments');
  await collection.createIndexes([
    { key: { studyId: 1, snapshotId: 1, organ: 1, createdAt: -1 }, name: 'target_organ_assessment_history' },
    { key: { status: 1, profileId: 1, createdAt: -1 }, name: 'target_organ_assessment_work_queue' },
    { key: { assessmentDigest: 1 }, name: 'target_organ_assessment_digest', unique: true },
  ]);
  const stored = { ...record, createdAt, assessmentDigest };
  const result = await collection.insertOne(stored);
  return { ...stored, id: result.insertedId.toHexString() };
}

export async function listTargetOrganAssessments(studyId: string, signalId?: string): Promise<TargetOrganAssessmentRecord[]> {
  const database = await solutionDatabase();
  if (!database) return inMemoryAssessments.filter((item) => item.studyId === studyId && (!signalId || item.signalId === signalId));
  const rows = await database.collection<Omit<TargetOrganAssessmentRecord, 'id'>>('target_organ_assessments')
    .find({ studyId, ...(signalId ? { signalId } : {}) })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return rows.map((row) => ({ ...row, id: row._id.toHexString(), _id: undefined } as unknown as TargetOrganAssessmentRecord));
}
