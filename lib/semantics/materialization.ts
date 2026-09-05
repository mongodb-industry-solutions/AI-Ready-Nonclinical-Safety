import { createHash } from 'node:crypto';
import type { SemanticProfileId, SemanticRuntimeBundle } from '@/lib/contracts';

export type SemanticResourceType =
  | 'object'
  | 'profile'
  | 'capability'
  | 'resolver'
  | 'action'
  | 'surface'
  | 'valueSet'
  | 'concept'
  | 'archetype'
  | 'storageBinding'
  | 'sourceAdapter'
  | 'subscription';

export interface SemanticResourceProjection {
  _id: string;
  releaseId: string;
  resourceType: SemanticResourceType;
  resourceId: string;
  label: string;
  visibleTo: SemanticProfileId[];
  contentHash: string;
  payload: Record<string, unknown>;
}

export interface SemanticSearchDocument {
  _id: string;
  releaseId: string;
  profileId: SemanticProfileId;
  resourceType: SemanticResourceType | 'edge';
  resourceId: string;
  label: string;
  text: string;
  sourceRef: string;
}

export interface SemanticEdgeProjection {
  _id: string;
  releaseId: string;
  id: string;
  from: string;
  to: string;
  label: string;
  predicate: string;
  visibleTo: SemanticProfileId[];
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)] as const)
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  return value;
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return typeof value === 'string' || typeof value === 'number' ? [String(value)] : [];
}

function intersection(left: SemanticProfileId[], right: SemanticProfileId[]): SemanticProfileId[] {
  const set = new Set(right);
  return left.filter((profile) => set.has(profile));
}

function union(groups: SemanticProfileId[][], fallback: SemanticProfileId[]): SemanticProfileId[] {
  const values = [...new Set(groups.flat())];
  return values.length ? values : fallback;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

function contentHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function profileSearchPayload(resource: SemanticResourceProjection, profileId: SemanticProfileId, visibleObjects: Set<string>): Record<string, unknown> {
  const payload = structuredClone(resource.payload);
  delete payload.visibleTo;
  delete payload.allowedProfiles;
  delete payload.position;
  delete payload.hiddenObjects;
  delete payload.maskedFields;
  if (resource.resourceType === 'concept' && Array.isArray(payload.semanticObjects)) {
    payload.semanticObjects = payload.semanticObjects.filter((id) => visibleObjects.has(String(id)));
  }
  if (resource.resourceType === 'archetype' && Array.isArray(payload.members)) {
    payload.members = payload.members.filter((member) => member && typeof member === 'object' && visibleObjects.has(String((member as { semanticObject?: string }).semanticObject)));
  }
  if (resource.resourceType === 'capability' && Array.isArray(payload.reads)) {
    payload.reads = payload.reads.filter((id) => visibleObjects.has(String(id)));
  }
  if (resource.resourceType === 'profile' && payload.id !== profileId) return {};
  return (compact(payload) || {}) as Record<string, unknown>;
}

export function materializeSemanticBundle(bundle: SemanticRuntimeBundle): {
  resources: SemanticResourceProjection[];
  edges: SemanticEdgeProjection[];
  searchDocuments: SemanticSearchDocument[];
} {
  const releaseId = bundle.release.releaseId;
  const allProfiles = bundle.profiles.map((profile) => profile.id);
  const objectProfiles = new Map(bundle.objects.map((object) => [object.id, object.visibleTo]));
  const capabilityProfiles = new Map(bundle.capabilities.map((capability) => [capability.id, capability.allowedProfiles]));

  const definitions: Array<[SemanticResourceType, Array<Record<string, unknown>>, (record: Record<string, unknown>) => SemanticProfileId[]]> = [
    ['object', bundle.objects as unknown as Array<Record<string, unknown>>, (record) => record.visibleTo as SemanticProfileId[]],
    ['profile', bundle.profiles as unknown as Array<Record<string, unknown>>, (record) => [record.id as SemanticProfileId]],
    ['capability', bundle.capabilities as unknown as Array<Record<string, unknown>>, (record) => record.allowedProfiles as SemanticProfileId[]],
    ['resolver', bundle.resolvers as unknown as Array<Record<string, unknown>>, (record) => capabilityProfiles.get(record.capability as string) || allProfiles],
    ['action', bundle.actions as unknown as Array<Record<string, unknown>>, (record) => record.allowedProfiles as SemanticProfileId[]],
    ['surface', bundle.surfaces as unknown as Array<Record<string, unknown>>, () => allProfiles],
    ['valueSet', bundle.valueSets as unknown as Array<Record<string, unknown>>, (record) => objectProfiles.get(String(record.binding).split('.')[0]) || allProfiles],
    ['concept', bundle.taxonomy.concepts as unknown as Array<Record<string, unknown>>, (record) => union(((record.semanticObjects as string[]) || []).map((id) => objectProfiles.get(id) || []), allProfiles)],
    ['archetype', bundle.archetypes as unknown as Array<Record<string, unknown>>, (record) => union(((record.members as Array<{ semanticObject: string }>) || []).map((member) => objectProfiles.get(member.semanticObject) || []), allProfiles)],
    ['storageBinding', bundle.storageBindings as unknown as Array<Record<string, unknown>>, (record) => objectProfiles.get(record.semanticObject as string) || allProfiles],
    ['sourceAdapter', bundle.sourceAdapters as unknown as Array<Record<string, unknown>>, () => allProfiles],
    ['subscription', bundle.subscriptions as unknown as Array<Record<string, unknown>>, () => allProfiles],
  ];

  const resources = definitions.flatMap(([resourceType, records, visibility]) => records.map((record) => {
    const resourceId = String(record.id);
    const payload = (compact(record) || {}) as Record<string, unknown>;
    return {
      _id: `${releaseId}|${resourceType}|${resourceId}`,
      releaseId,
      resourceType,
      resourceId,
      label: String(record.label || resourceId),
      visibleTo: visibility(record),
      contentHash: contentHash(payload),
      payload,
    };
  }));

  const edges = bundle.edges.map((edge) => ({
    _id: `${releaseId}|edge|${edge.id}`,
    releaseId,
    ...edge,
    visibleTo: intersection(objectProfiles.get(edge.from) || allProfiles, objectProfiles.get(edge.to) || allProfiles),
  }));

  const searchDocuments: SemanticSearchDocument[] = [
    ...resources.flatMap((resource) => resource.visibleTo.map((profileId) => {
      const visibleObjects = new Set(bundle.objects.filter((object) => object.visibleTo.includes(profileId) && !(bundle.profiles.find((profile) => profile.id === profileId)?.hiddenObjects || []).includes(object.id)).map((object) => object.id));
      const payload = profileSearchPayload(resource, profileId, visibleObjects);
      return {
        _id: `${resource._id}|${profileId}`,
        releaseId,
        profileId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        label: resource.label,
        text: [...new Set([resource.resourceType, resource.label, ...strings(payload)])].join(' ').slice(0, 12_000),
        sourceRef: `semantic-resource:${resource._id}`,
      };
    })),
    ...edges.flatMap((edge) => edge.visibleTo.map((profileId) => ({
      _id: `${edge._id}|${profileId}`,
      releaseId,
      profileId,
      resourceType: 'edge' as const,
      resourceId: edge.id,
      label: edge.label,
      text: `edge ${edge.label} ${edge.predicate} from ${edge.from} to ${edge.to}`,
      sourceRef: `semantic-edge:${edge._id}`,
    }))),
  ];

  return { resources, edges, searchDocuments };
}
