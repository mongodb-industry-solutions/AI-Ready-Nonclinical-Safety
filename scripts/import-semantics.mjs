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
  const release = { ...bundle.release, apiVersion: bundle.apiVersion, digest, bundle, importedAt: new Date() };
  const existingRelease = await database.collection('semantic_releases').findOne({ releaseId: release.releaseId }, { projection: { digest: 1 } });
  if (existingRelease?.digest && existingRelease.digest !== digest) throw new Error(`Release ${release.releaseId} already exists with a different digest`);
  await database.collection('semantic_releases').updateOne({ releaseId: release.releaseId }, { $setOnInsert: release, $unset: { active: '' } }, { upsert: true });

  const allProfiles = bundle.profiles.map((profile) => profile.id);
  const objectProfiles = new Map(bundle.objects.map((object) => [object.id, object.visibleTo]));
  const capabilityProfiles = new Map(bundle.capabilities.map((capability) => [capability.id, capability.allowedProfiles]));
  const compact = (value) => {
    if (Array.isArray(value)) {
      const items = value.map(compact).filter((item) => item !== undefined);
      return items.length ? items : undefined;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).map(([key, item]) => [key, compact(item)]).filter(([, item]) => item !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return value === null || value === undefined || value === '' ? undefined : value;
  };
  const strings = (value) => Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : typeof value === 'string' || typeof value === 'number' ? [String(value)] : [];
  const union = (groups, fallback) => [...new Set(groups.flat())].length ? [...new Set(groups.flat())] : fallback;
  const resourceHash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
  const definitions = [
    ['object', bundle.objects, (record) => record.visibleTo],
    ['profile', bundle.profiles, (record) => [record.id]],
    ['capability', bundle.capabilities, (record) => record.allowedProfiles],
    ['resolver', bundle.resolvers, (record) => capabilityProfiles.get(record.capability) || allProfiles],
    ['action', bundle.actions, (record) => record.allowedProfiles],
    ['surface', bundle.surfaces, () => allProfiles],
    ['valueSet', bundle.valueSets, (record) => objectProfiles.get(record.binding.split('.')[0]) || allProfiles],
    ['concept', bundle.taxonomy.concepts, (record) => union(record.semanticObjects.map((id) => objectProfiles.get(id) || []), allProfiles)],
    ['archetype', bundle.archetypes, (record) => union(record.members.map((member) => objectProfiles.get(member.semanticObject) || []), allProfiles)],
    ['storageBinding', bundle.storageBindings, (record) => objectProfiles.get(record.semanticObject) || allProfiles],
    ['sourceAdapter', bundle.sourceAdapters, () => allProfiles],
    ['subscription', bundle.subscriptions, () => allProfiles],
  ];
  const resources = definitions.flatMap(([resourceType, records, visibility]) => records.map((record) => ({
    _id: `${release.releaseId}|${resourceType}|${record.id}`,
    releaseId: release.releaseId,
    resourceType,
    resourceId: record.id,
    label: record.label || record.id,
    visibleTo: visibility(record),
    contentHash: resourceHash(compact(record)),
    payload: compact(record),
  })));
  const intersection = (left, right) => left.filter((profile) => new Set(right).has(profile));
  const edges = bundle.edges.map((edge) => ({
    _id: `${release.releaseId}|edge|${edge.id}`,
    releaseId: release.releaseId,
    ...edge,
    visibleTo: intersection(objectProfiles.get(edge.from) || allProfiles, objectProfiles.get(edge.to) || allProfiles),
  }));
  const visibleObjectsByProfile = new Map(bundle.profiles.map((profile) => [profile.id, new Set(bundle.objects.filter((object) => object.visibleTo.includes(profile.id) && !(profile.hiddenObjects || []).includes(object.id)).map((object) => object.id))]));
  const profileSearchPayload = (resource, profileId) => {
    const payload = structuredClone(resource.payload);
    const visibleObjects = visibleObjectsByProfile.get(profileId) || new Set();
    delete payload.visibleTo;
    delete payload.allowedProfiles;
    delete payload.position;
    delete payload.hiddenObjects;
    delete payload.maskedFields;
    if (resource.resourceType === 'concept' && Array.isArray(payload.semanticObjects)) payload.semanticObjects = payload.semanticObjects.filter((id) => visibleObjects.has(id));
    if (resource.resourceType === 'archetype' && Array.isArray(payload.members)) payload.members = payload.members.filter((member) => visibleObjects.has(member.semanticObject));
    if (resource.resourceType === 'capability' && Array.isArray(payload.reads)) payload.reads = payload.reads.filter((id) => visibleObjects.has(id));
    return compact(payload) || {};
  };
  const searchDocuments = [
    ...resources.flatMap((resource) => resource.visibleTo.map((profileId) => ({
      _id: `${resource._id}|${profileId}`,
      releaseId: resource.releaseId,
      profileId,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      label: resource.label,
      text: [...new Set([resource.resourceType, resource.label, ...strings(profileSearchPayload(resource, profileId))])].join(' ').slice(0, 12_000),
      sourceRef: `semantic-resource:${resource._id}`,
    }))),
    ...edges.flatMap((edge) => edge.visibleTo.map((profileId) => ({
      _id: `${edge._id}|${profileId}`,
      releaseId: edge.releaseId,
      profileId,
      resourceType: 'edge',
      resourceId: edge.id,
      label: edge.label,
      text: `edge ${edge.label} ${edge.predicate} from ${edge.from} to ${edge.to}`,
      sourceRef: `semantic-edge:${edge._id}`,
    }))),
  ];

  const resourceCollection = database.collection('semantic_resources');
  await resourceCollection.deleteMany({ releaseId: release.releaseId });
  if (resources.length) await resourceCollection.insertMany(resources);
  await resourceCollection.createIndex({ releaseId: 1, resourceType: 1, resourceId: 1 }, { unique: true, name: 'release_resource_id' });
  await resourceCollection.createIndex({ releaseId: 1, resourceType: 1, visibleTo: 1 }, { name: 'release_type_visibility' });

  const edgeCollection = database.collection('semantic_edges');
  await edgeCollection.deleteMany({ releaseId: release.releaseId });
  if (edges.length) await edgeCollection.insertMany(edges);
  await edgeCollection.createIndex({ releaseId: 1, from: 1, predicate: 1, to: 1 }, { unique: true, name: 'semantic_edge_forward' });
  await edgeCollection.createIndex({ releaseId: 1, to: 1, predicate: 1, from: 1 }, { name: 'semantic_edge_reverse' });

  const searchCollection = database.collection('semantic_search_documents');
  const searchIndexes = await searchCollection.listIndexes().toArray();
  if (searchIndexes.some((index) => index.name === 'semantic_search_resource')) await searchCollection.dropIndex('semantic_search_resource');
  if (searchIndexes.some((index) => index.name === 'semantic_search_scope')) await searchCollection.dropIndex('semantic_search_scope');
  await searchCollection.deleteMany({ releaseId: release.releaseId });
  if (searchDocuments.length) await searchCollection.insertMany(searchDocuments);
  await searchCollection.createIndex({ releaseId: 1, profileId: 1, resourceType: 1, resourceId: 1 }, { unique: true, name: 'semantic_search_profile_resource' });
  await searchCollection.createIndex({ releaseId: 1, profileId: 1 }, { name: 'semantic_search_scope_v2' });
  await database.collection('semantic_runtime_pointer').replaceOne({ id: 'active' }, { id: 'active', releaseId: release.releaseId, digest, activatedAt: new Date() }, { upsert: true });
  console.log(`Imported ${release.releaseId} (${digest}): ${resources.length} polymorphic resources, ${edges.length} graph edges, ${searchDocuments.length} auto-embedding source documents.`);
} finally {
  await client.close();
}
