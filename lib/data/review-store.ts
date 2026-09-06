import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import type { InvestigationResult, ReviewActionRecord, SemanticProfileId } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';

type InvestigationRecord = {
  sessionId: string;
  turn: number;
  studyId: string;
  snapshotId: string;
  signalId: string;
  profileId: SemanticProfileId;
  question: string;
  result: InvestigationResult;
  createdAt: Date;
};

type InvestigationSession = {
  _id: string;
  studyId: string;
  snapshotId: string;
  signalId: string;
  profileId: SemanticProfileId;
  semanticReleaseId: string;
  turnCount: number;
  createdAt: Date;
  lastActivityAt: Date;
};

const inMemoryInvestigationSessions = new Map<string, InvestigationSession>();

export class InvestigationSessionScopeError extends Error {}

export async function bindInvestigationSession(input: {
  sessionId?: string;
  studyId: string;
  snapshotId: string;
  signalId: string;
  profileId: SemanticProfileId;
  semanticReleaseId: string;
}): Promise<{ sessionId: string; turn: number }> {
  const sessionId = input.sessionId || `safety-${randomUUID()}`;
  const scope = {
    studyId: input.studyId,
    snapshotId: input.snapshotId,
    signalId: input.signalId,
    profileId: input.profileId,
  };
  const database = await solutionDatabase();
  if (!database) {
    const existing = inMemoryInvestigationSessions.get(sessionId);
    if (existing && Object.entries(scope).some(([key, value]) => existing[key as keyof InvestigationSession] !== value)) {
      throw new InvestigationSessionScopeError('The investigation session is already bound to another evidence scope.');
    }
    const now = new Date();
    const turn = (existing?.turnCount || 0) + 1;
    inMemoryInvestigationSessions.set(sessionId, {
      _id: sessionId,
      ...scope,
      semanticReleaseId: input.semanticReleaseId,
      turnCount: turn,
      createdAt: existing?.createdAt || now,
      lastActivityAt: now,
    });
    return { sessionId, turn };
  }

  const collection = database.collection<InvestigationSession>('investigation_sessions');
  await collection.createIndexes([
    { key: { studyId: 1, snapshotId: 1, signalId: 1, lastActivityAt: -1 }, name: 'evidence_scope_sessions' },
    { key: { lastActivityAt: 1 }, name: 'session_retention_ttl', expireAfterSeconds: 60 * 60 * 24 * 30 },
  ]);
  const existing = await collection.findOne({ _id: sessionId });
  if (existing && Object.entries(scope).some(([key, value]) => existing[key as keyof InvestigationSession] !== value)) {
    throw new InvestigationSessionScopeError('The investigation session is already bound to another evidence scope.');
  }
  const now = new Date();
  await collection.updateOne(
    { _id: sessionId },
    {
      $set: { ...scope, semanticReleaseId: input.semanticReleaseId, lastActivityAt: now },
      $setOnInsert: { createdAt: now },
      $inc: { turnCount: 1 },
    },
    { upsert: true },
  );
  return { sessionId, turn: (existing?.turnCount || 0) + 1 };
}

export function configuredForReviewStore(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

async function investigations(): Promise<Collection<InvestigationRecord> | null> {
  const database = await solutionDatabase();
  if (!database) return null;
  const collection = database.collection<InvestigationRecord>('investigations');
  await collection.createIndexes([
    { key: { studyId: 1, snapshotId: 1, createdAt: -1 }, name: 'study_snapshot_history' },
    {
      key: { sessionId: 1, turn: 1 },
      name: 'session_turns',
      unique: true,
      partialFilterExpression: { sessionId: { $type: 'string' }, turn: { $type: 'number' } },
    },
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
