import type { Collection } from 'mongodb';
import type { InvestigationResult } from '@/lib/contracts';
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
