import type { HybridQueryPlan, SemanticProfileId, SemanticRuntimeBundle } from '@/lib/contracts';

export function compileLiteratureQueryPlan(bundle: SemanticRuntimeBundle, profileId: SemanticProfileId = 'toxicologist'): HybridQueryPlan {
  const resolver = bundle.resolvers.find((item) => item.id === 'resolver.literature-evidence.v1');
  if (!resolver?.containmentPlan) throw new Error('Literature resolver has no compiled containment plan');
  const capability = bundle.capabilities.find((item) => item.id === resolver.capability);
  if (!capability) throw new Error(`Literature resolver references unavailable capability ${resolver.capability}`);
  if (!capability.allowedProfiles.includes(profileId)) throw new Error(`Profile ${profileId} is not authorized for ${resolver.id}`);
  const unavailable = resolver.containmentPlan.contains.filter((item) => !capability.reads.includes(item));
  if (unavailable.length) throw new Error(`Literature capability cannot read contained objects: ${unavailable.join(', ')}`);
  return {
    resolverId: resolver.id,
    capabilityId: capability.id,
    profileId,
    semanticScope: {
      language: resolver.containmentPlan.language,
      semantics: resolver.containmentPlan.semantics,
      rootArchetype: resolver.containmentPlan.rootArchetype,
      contains: resolver.containmentPlan.contains,
    },
    physicalTarget: 'mongodb',
    stages: [
      { id: 'containment', engine: 'mongodb-aggregation', purpose: 'Compile archetype membership and containment into exact study/finding scope.' },
      { id: 'lexical', engine: 'atlas-search', purpose: 'Retrieve terminology-grounded lexical candidates.' },
      { id: 'vector', engine: 'atlas-vector-search', purpose: 'Retrieve semantically similar licensed passages.' },
      { id: 'graph', engine: 'mongodb-graph-lookup', purpose: 'Expand concepts, publications, passages, and assertions.' },
      { id: 'fuse', engine: 'reciprocal-rank-fusion', purpose: 'Combine independently ranked candidate lists.' },
      { id: 'rerank', engine: 'domain-reranker', purpose: 'Rank by species, organ, morphology, study design, and evidence role.' },
    ],
    fusion: 'reciprocal-rank-fusion',
    finalRanking: 'domain-reranker',
  };
}
