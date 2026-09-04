import { MongoClient, type Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var __safetyMongoClient: Promise<MongoClient> | undefined;
}

export function configuredForMongoDB(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function solutionDatabase(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  globalThis.__safetyMongoClient ??= new MongoClient(uri).connect();
  const client = await globalThis.__safetyMongoClient;
  return client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
}
