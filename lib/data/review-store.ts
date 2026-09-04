import { MongoClient, type Collection } from 'mongodb';
import type { InvestigationResult } from '@/lib/contracts';

type InvestigationRecord = {
  studyId: string;
  snapshotId: string;
  signalId: string;
  question: string;
  result: InvestigationResult;
  createdAt: Date;
};

declare global {
  // eslint-disable-next-line no-var
  var __safetyMongoClient: Promise<MongoClient> | undefined;
}

export function configuredForReviewStore(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

async function investigations(): Promise<Collection<InvestigationRecord> | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  globalThis.__safetyMongoClient ??= new MongoClient(uri).connect();
  const client = await globalThis.__safetyMongoClient;
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
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
