import type { HybridQueryPlan, SemanticRuntimeBundle } from '@/lib/contracts';

export function compileLiteratureQueryPlan(bundle: SemanticRuntimeBundle): HybridQueryPlan {
  const resolver = bundle.resolvers.find((item) => item.id === 'resolver.literature-evidence.v1');
  if (!resolver?.containmentPlan) throw new Error('Literature resolver has no compiled containment plan');
  return {
    resolverId: resolver.id,
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
