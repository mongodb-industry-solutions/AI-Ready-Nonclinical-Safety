import { MongoClient, type Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var __safetyMongoClient: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __safetyMongoWarned: boolean | undefined;
}

export function configuredForMongoDB(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/**
 * Returns the solution database, or `null` when MongoDB is not configured or not
 * reachable.
 *
 * Returning `null` rather than throwing is deliberate: every repository already
 * degrades to the checked-in portable bundle, which is what keeps the documented
 * "runs without MongoDB" promise true even when a configured deployment is
 * temporarily unreachable. A failed connection also clears the cached promise so
 * a later request can reconnect instead of inheriting a permanently rejected one.
 */
export async function solutionDatabase(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  globalThis.__safetyMongoClient ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
  }).connect();

  try {
    const client = await globalThis.__safetyMongoClient;
    globalThis.__safetyMongoWarned = false;
    return client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  } catch (error) {
    globalThis.__safetyMongoClient = undefined;
    if (!globalThis.__safetyMongoWarned) {
      globalThis.__safetyMongoWarned = true;
      console.warn('[nonclinical-safety] MongoDB is unreachable; serving the portable bundle instead.', error instanceof Error ? error.message : error);
    }
    return null;
  }
}
