import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const workspacePath = new URL('semantic/contextstudio-workspace.json', root);
const workspace = JSON.parse(await readFile(workspacePath, 'utf8'));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

async function load(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, workspacePath), 'utf8'));
}

const modules = await Promise.all(workspace.modules.map(load));
const [core, extension, persistence] = modules;
if (core.kind !== 'SemanticModule' || extension.kind !== 'SemanticModule' || persistence.kind !== 'PersistenceBindingModule') {
  throw new Error('Context Studio workspace modules are not ordered as core, extension, and persistence binding');
}
if (persistence.dataContract !== workspace.requires.dataContract || persistence.modelSchemaVersion !== workspace.requires.modelSchemaVersion) {
  throw new Error('MongoDB persistence binding is incompatible with the workspace CDISC data contract');
}

const objects = [...core.objects, ...extension.objects];
const objectIds = new Set(objects.map((object) => object.id));
if (objectIds.size !== objects.length) throw new Error('Semantic modules export duplicate object ids');
for (const binding of persistence.storageBindings) {
  if (!objectIds.has(binding.semanticObject)) throw new Error(`Binding ${binding.id} references unknown object ${binding.semanticObject}`);
}
for (const resolver of extension.resolvers) {
  const missing = (resolver.containmentPlan?.contains || []).filter((id) => !objectIds.has(id));
  if (missing.length) throw new Error(`Resolver ${resolver.id} contains unknown objects: ${missing.join(', ')}`);
}

const moduleDescriptors = modules.map((module) => ({
  packageId: module.packageId,
  version: module.version,
  kind: module.kind,
  contentDigest: digest(module),
}));
const bundle = {
  apiVersion: 'contextobjects.dev/runtime-bundle/v2',
  kind: 'SemanticRuntimeBundle',
  release: workspace.release,
  requires: workspace.requires,
  modules: moduleDescriptors,
  objects,
  edges: [...(core.edges || []), ...(extension.edges || [])],
  profiles: extension.profiles,
  capabilities: extension.capabilities,
  resolvers: extension.resolvers,
  queryContracts: extension.queryContracts,
  actions: extension.actions,
  surfaces: extension.surfaces,
  valueSets: [...(core.valueSets || []), ...(extension.valueSets || [])],
  taxonomy: { concepts: [...(core.taxonomy?.concepts || []), ...(extension.taxonomy?.concepts || [])] },
  archetypes: [...(core.archetypes || []), ...(extension.archetypes || [])],
  storageBindings: persistence.storageBindings,
  projectionRecipes: persistence.projectionRecipes,
  indexes: persistence.indexes,
  sourceAdapters: extension.sourceAdapters,
  subscriptions: extension.subscriptions,
  governance: extension.governance,
};
bundle.contentDigest = digest(bundle);

const output = new URL(workspace.output, workspacePath);
await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`Compiled ${bundle.release.releaseId} from ${modules.length} Context Studio modules (${bundle.contentDigest}).`);

