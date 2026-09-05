import type { SemanticProfileId, SemanticRuntimeBundle } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';
import { materializeSemanticBundle, type SemanticSearchDocument } from '@/lib/semantics/materialization';

type Candidate = { _id: string; score?: number };

export interface SemanticSearchHit {
  resourceType: SemanticSearchDocument['resourceType'];
  resourceId: string;
  label: string;
  excerpt: string;
  score: number;
  lanes: Array<'lexical' | 'vector'>;
  sourceRef: string;
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2) || []);
}

function fixtureSearch(bundle: SemanticRuntimeBundle, profileId: SemanticProfileId, query: string, limit: number) {
  const queryTokens = tokens(query);
  const searchDocuments = materializeSemanticBundle(bundle).searchDocuments
    .filter((document) => document.profileId === profileId)
    .map((document) => {
      const documentTokens = tokens(document.text);
      const overlap = [...queryTokens].filter((token) => documentTokens.has(token)).length;
      return { document, overlap };
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.document.label.localeCompare(right.document.label))
    .slice(0, limit);
  const maximum = searchDocuments.length ? Math.max(...searchDocuments.map((item) => item.overlap), 1) : 1;
  return {
    mode: 'portable-bundle' as const,
    hits: searchDocuments.map(({ document, overlap }) => ({
      resourceType: document.resourceType,
      resourceId: document.resourceId,
      label: document.label,
      excerpt: document.text.slice(0, 220),
      score: Math.round((overlap / maximum) * 100),
      lanes: ['lexical' as const],
      sourceRef: document.sourceRef,
    })),
    stages: [
      { id: 'profile-scope', status: 'executed', detail: `Applied the ${profileId} semantic projection.` },
      { id: 'lexical', status: 'fallback', detail: 'Ranked the signed portable bundle because MongoDB retrieval is unavailable.' },
      { id: 'vector', status: 'skipped', detail: 'Atlas Automated Embedding requires a connected Atlas deployment.' },
      { id: 'fuse', status: 'fallback', detail: 'Only the portable lexical lane contributed candidates.' },
    ],
  };
}

function rank(
  documents: SemanticSearchDocument[],
  lexical: Candidate[],
  vector: Candidate[],
  limit: number,
): SemanticSearchHit[] {
  const scores = new Map<string, number>();
  const lanes = new Map<string, Set<'lexical' | 'vector'>>();
  for (const [lane, candidates] of [['lexical', lexical], ['vector', vector]] as const) {
    candidates.forEach((candidate, index) => {
      scores.set(candidate._id, (scores.get(candidate._id) || 0) + 1 / (60 + index + 1));
      const membership = lanes.get(candidate._id) || new Set<'lexical' | 'vector'>();
      membership.add(lane);
      lanes.set(candidate._id, membership);
    });
  }
  const ranked = documents
    .filter((document) => scores.has(document._id))
    .sort((left, right) => (scores.get(right._id) || 0) - (scores.get(left._id) || 0) || left.label.localeCompare(right.label))
    .slice(0, limit);
  const maximum = ranked.length ? Math.max(...ranked.map((document) => scores.get(document._id) || 0)) : 1;
  return ranked.map((document) => ({
    resourceType: document.resourceType,
    resourceId: document.resourceId,
    label: document.label,
    excerpt: document.text.slice(0, 220),
    score: Math.round(((scores.get(document._id) || 0) / maximum) * 100),
    lanes: [...(lanes.get(document._id) || [])],
    sourceRef: document.sourceRef,
  }));
}

export async function searchSemanticMap({
  bundle,
  profileId,
  query,
  limit = 8,
}: {
  bundle: SemanticRuntimeBundle;
  profileId: SemanticProfileId;
  query: string;
  limit?: number;
}) {
  const boundedQuery = query.trim().slice(0, 500);
  const boundedLimit = Math.min(Math.max(limit, 1), 20);
  const managedEmbedding = {
    index: process.env.ATLAS_SEMANTIC_AUTO_EMBED_INDEX || 'semantic_map_auto_embed',
    sourcePath: 'text',
    vectorStorage: '__mdb_internal_search',
    vectorFieldInSourceDocument: false,
  };
  const database = await solutionDatabase().catch(() => null);
  if (!database) return { ...fixtureSearch(bundle, profileId, boundedQuery, boundedLimit), query: boundedQuery, managedEmbedding };

  const collection = database.collection<SemanticSearchDocument>('semantic_search_documents');
  let lexical: Candidate[] = [];
  let lexicalStatus: 'executed' | 'fallback' = 'executed';
  try {
    lexical = await collection.aggregate<Candidate>([
      {
        $search: {
          index: process.env.ATLAS_SEMANTIC_SEARCH_INDEX || 'semantic_map_search',
          compound: {
            filter: [
              { text: { path: 'releaseId', query: bundle.release.releaseId } },
              { text: { path: 'profileId', query: profileId } },
            ],
            should: [
              { text: { path: 'text', query: boundedQuery, fuzzy: { maxEdits: 1 } } },
              { text: { path: 'label', query: boundedQuery } },
            ],
            minimumShouldMatch: 1,
          },
        },
      },
      { $limit: boundedLimit * 3 },
      { $project: { _id: 1, score: { $meta: 'searchScore' } } },
    ]).toArray();
  } catch {
    lexicalStatus = 'fallback';
    const terms = boundedQuery.match(/[a-z0-9]+/gi)?.filter((item) => item.length > 2).slice(0, 8) || [];
    const pattern = terms.length ? terms.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : '.*';
    lexical = await collection.find(
      { releaseId: bundle.release.releaseId, profileId, text: { $regex: pattern, $options: 'i' } },
      { projection: { _id: 1 }, limit: boundedLimit * 3 },
    ).toArray() as Candidate[];
  }

  let vector: Candidate[] = [];
  let vectorStatus: 'executed' | 'fallback' = 'executed';
  try {
    vector = await collection.aggregate<Candidate>([
      {
        $vectorSearch: {
          index: process.env.ATLAS_SEMANTIC_AUTO_EMBED_INDEX || 'semantic_map_auto_embed',
          path: 'text',
          query: boundedQuery,
          filter: { releaseId: bundle.release.releaseId, profileId },
          numCandidates: Math.max(boundedLimit * 10, 50),
          limit: boundedLimit * 3,
        },
      },
      { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
    ]).toArray();
  } catch {
    vectorStatus = 'fallback';
  }

  const candidateIds = [...new Set([...lexical, ...vector].map((candidate) => candidate._id))];
  const documents = candidateIds.length
    ? await collection.find({ _id: { $in: candidateIds }, releaseId: bundle.release.releaseId, profileId }).toArray()
    : [];
  const hits = rank(documents, lexical, vector, boundedLimit);
  return {
    query: boundedQuery,
    mode: vector.length ? 'atlas-hybrid' as const : lexicalStatus === 'executed' ? 'atlas-search' as const : 'mongodb-exact' as const,
    hits,
    stages: [
      { id: 'profile-scope', status: 'executed', detail: `Release ${bundle.release.releaseId} and profile ${profileId} constrained both retrieval lanes.` },
      { id: 'lexical', status: lexicalStatus, detail: lexicalStatus === 'executed' ? 'Atlas Search matched labels and semantic text.' : 'A bounded MongoDB text fallback matched the semantic projection.' },
      { id: 'vector', status: vectorStatus, detail: vectorStatus === 'executed' ? 'Atlas Automated Embedding embedded the query and searched the semantic text projection.' : 'The managed vector lane was unavailable; no manual vector fallback exists.' },
      { id: 'fuse', status: vector.length && lexical.length ? 'executed' : 'fallback', detail: vector.length && lexical.length ? 'Reciprocal-rank fusion combined lexical and vector candidates.' : 'Available candidates were ranked without cross-lane fusion.' },
    ],
    managedEmbedding,
  };
}
