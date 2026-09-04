import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';

const source = new URL('../semantic/nonclinical-safety-runtime.json', import.meta.url);
const bundle = JSON.parse(await readFile(source, 'utf8'));

if (bundle.apiVersion !== 'contextobjects.dev/runtime-bundle/v1' || bundle.kind !== 'SemanticRuntimeBundle') {
  throw new Error('Unsupported semantic runtime bundle');
}
for (const field of ['objects', 'edges', 'profiles', 'capabilities', 'resolvers', 'actions', 'surfaces', 'valueSets', 'archetypes', 'storageBindings', 'sourceAdapters', 'subscriptions']) {
  if (!Array.isArray(bundle[field])) throw new Error(`Semantic bundle is missing ${field}`);
}
if (!bundle.taxonomy || !Array.isArray(bundle.taxonomy.concepts)) throw new Error('Semantic bundle is missing taxonomy concepts');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const unsigned = { ...bundle };
delete unsigned.contentDigest;
const digest = `sha256:${createHash('sha256').update(JSON.stringify(stable(unsigned))).digest('hex')}`;
if (bundle.contentDigest && bundle.contentDigest !== digest) throw new Error(`Semantic bundle digest mismatch: expected ${bundle.contentDigest}, calculated ${digest}`);
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

const client = new MongoClient(uri);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  const release = { ...bundle.release, apiVersion: bundle.apiVersion, digest, bundle, importedAt: new Date(), active: true };
  await database.collection('semantic_releases').updateMany({}, { $set: { active: false } });
  await database.collection('semantic_releases').replaceOne({ releaseId: release.releaseId }, release, { upsert: true });

  const resources = [
    ['semantic_objects', bundle.objects, 'id'],
    ['semantic_edges', bundle.edges, 'id'],
    ['semantic_profiles', bundle.profiles, 'id'],
    ['semantic_capabilities', bundle.capabilities, 'id'],
    ['semantic_resolvers', bundle.resolvers, 'id'],
    ['semantic_actions', bundle.actions, 'id'],
    ['semantic_value_sets', bundle.valueSets, 'id'],
    ['semantic_concepts', bundle.taxonomy.concepts, 'id'],
    ['semantic_archetypes', bundle.archetypes, 'id'],
    ['semantic_storage_bindings', bundle.storageBindings, 'id'],
    ['semantic_source_adapters', bundle.sourceAdapters, 'id'],
  ];
  for (const [collectionName, records, idField] of resources) {
    const collection = database.collection(collectionName);
    if (records.length) {
      await collection.bulkWrite(records.map((record) => ({ replaceOne: { filter: { releaseId: release.releaseId, [idField]: record[idField] }, replacement: { ...record, releaseId: release.releaseId }, upsert: true } })));
    }
    await collection.createIndex({ releaseId: 1, [idField]: 1 }, { unique: true, name: 'release_resource_id' });
  }
  await database.collection('semantic_runtime_pointer').replaceOne({ id: 'active' }, { id: 'active', releaseId: release.releaseId, digest, activatedAt: new Date() }, { upsert: true });
  console.log(`Imported ${release.releaseId} (${digest})`);
} finally {
  await client.close();
}
