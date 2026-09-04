import type { Collection } from 'mongodb';
import type { InvestigationResult, ReviewActionRecord } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';

type InvestigationRecord = {
  studyId: string;
  snapshotId: string;
  signalId: string;
  question: string;
  result: InvestigationResult;
  createdAt: Date;
};

export function configuredForReviewStore(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

async function investigations(): Promise<Collection<InvestigationRecord> | null> {
  const database = await solutionDatabase();
  if (!database) return null;
  const collection = database.collection<InvestigationRecord>('investigations');
  await collection.createIndexes([
    { key: { studyId: 1, snapshotId: 1, createdAt: -1 }, name: 'study_snapshot_history' },
    { key: { createdAt: 1 }, name: 'retention_ttl', expireAfterSeconds: 60 * 60 * 24 * 90 },
  ]);
  return collection;
}

export async function recordInvestigation(
  record: Omit<InvestigationRecord, 'createdAt'>,
): Promise<string | null> {
  const collection = await investigations();
  if (!collection) return null;
  const inserted = await collection.insertOne({ ...record, createdAt: new Date() });
  return inserted.insertedId.toHexString();
}

const inMemoryReviewActions: ReviewActionRecord[] = [];

export async function recordReviewAction(
  record: Omit<ReviewActionRecord, 'id' | 'createdAt'>,
): Promise<ReviewActionRecord> {
  const createdAt = new Date().toISOString();
  const database = await solutionDatabase();
  if (!database) {
    const saved = { ...record, id: `local-${crypto.randomUUID()}`, createdAt };
    inMemoryReviewActions.unshift(saved);
    return saved;
  }

  const collection = database.collection<Omit<ReviewActionRecord, 'id'>>('review_actions');
  await collection.createIndexes([
    { key: { studyId: 1, snapshotId: 1, signalId: 1, createdAt: -1 }, name: 'review_history' },
    { key: { profile: 1, action: 1, status: 1 }, name: 'review_work_queue' },
  ]);
  const stored = { ...record, createdAt };
  const result = await collection.insertOne(stored);
  return { ...stored, id: result.insertedId.toHexString() };
}

export async function listReviewActions(studyId: string, signalId?: string): Promise<ReviewActionRecord[]> {
  const database = await solutionDatabase();
  if (!database) {
    return inMemoryReviewActions.filter((item) => item.studyId === studyId && (!signalId || item.signalId === signalId));
  }
  const query = { studyId, ...(signalId ? { signalId } : {}) };
  const rows = await database.collection<Omit<ReviewActionRecord, 'id'>>('review_actions').find(query).sort({ createdAt: -1 }).limit(100).toArray();
  return rows.map((row) => ({ ...row, id: row._id.toHexString(), _id: undefined } as unknown as ReviewActionRecord));
}
