import runtimeBundle from '@/semantic/nonclinical-safety-runtime.json';
import type { SemanticProfileId, SemanticRuntimeBundle, SemanticRuntimeView } from '@/lib/contracts';

const bundle = runtimeBundle as unknown as SemanticRuntimeBundle;

export function semanticRuntimeBundle(): SemanticRuntimeBundle {
  if (bundle.apiVersion !== 'contextobjects.dev/runtime-bundle/v1' || bundle.kind !== 'SemanticRuntimeBundle') {
    throw new Error('Unsupported semantic runtime bundle');
  }
  return bundle;
}

export function isSemanticProfile(value: string | null | undefined): value is SemanticProfileId {
  return semanticRuntimeBundle().profiles.some((profile) => profile.id === value);
}

export function semanticRuntimeForProfile(requested: string | null | undefined): SemanticRuntimeView {
  const source = semanticRuntimeBundle();
  const profileId: SemanticProfileId = isSemanticProfile(requested) ? requested : 'toxicologist';
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
