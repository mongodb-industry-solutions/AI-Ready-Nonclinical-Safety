import runtimeBundle from '@/semantic/nonclinical-safety-runtime.json';
import type { SemanticProfileId, SemanticRuntimeBundle, SemanticRuntimeView } from '@/lib/contracts';

const bundle = runtimeBundle as unknown as SemanticRuntimeBundle;

export function semanticRuntimeBundle(): SemanticRuntimeBundle {
  if (bundle.apiVersion !== 'contextobjects.dev/runtime-bundle/v2' || bundle.kind !== 'SemanticRuntimeBundle') {
    throw new Error('Unsupported semantic runtime bundle');
  }
  if (bundle.requires.dataContract !== 'kehrnel.dev/cdisc-solution-evidence/v2' || bundle.requires.modelSchemaVersion !== '2.0.0') {
    throw new Error('Semantic runtime is not bound to the CDISC v2 evidence contract');
  }
  return bundle;
}

export function isSemanticProfile(value: string | null | undefined): value is SemanticProfileId {
  return semanticRuntimeBundle().profiles.some((profile) => profile.id === value);
}

export function semanticRuntimeForProfile(requested: string | null | undefined, source: SemanticRuntimeBundle = semanticRuntimeBundle()): SemanticRuntimeView {
  const sourceProfileIds = source.profiles.map((profile) => profile.id);
  const profileId: SemanticProfileId = requested && sourceProfileIds.includes(requested as SemanticProfileId) ? requested as SemanticProfileId : 'toxicologist';
  const activeProfile = source.profiles.find((profile) => profile.id === profileId)!;
  const hidden = new Set(activeProfile.hiddenObjects || []);
  const objects = source.objects.filter((object) => object.visibleTo.includes(profileId) && !hidden.has(object.id));
  const objectIds = new Set(objects.map((object) => object.id));

  return {
    ...source,
    activeProfile,
    objects,
    edges: source.edges.filter((edge) => objectIds.has(edge.from) && objectIds.has(edge.to)),
    capabilities: source.capabilities.filter((capability) => capability.allowedProfiles.includes(profileId)),
    actions: source.actions.filter((action) => action.allowedProfiles.includes(profileId)),
  };
}

export function canPerformSemanticAction(profile: SemanticProfileId, actionId: string): boolean {
  return semanticRuntimeBundle().actions.some((action) => action.id === actionId && action.allowedProfiles.includes(profile));
}
