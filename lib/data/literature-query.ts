import type {
  LiteratureDocument,
  LiteratureQueryExecution,
  RankedLiteratureDocument,
  RetrievalStageResult,
  SemanticProfileId,
  SemanticRuntimeBundle,
} from '@/lib/contracts';
import { allLiterature } from '@/lib/data/literature-repository';
import { solutionDatabase } from '@/lib/data/mongodb';

type Candidate = { publicationId: string; score?: number };
type LiteratureChunk = Candidate & { text: string; concepts: string[]; matchedSignalIds: string[] };
type RetrievalLane = 'containment' | 'lexical' | 'vector' | 'graph';

const roleWeight: Record<LiteratureDocument['evidenceRole'], number> = {
  'pathology-reference': 0.022,
  'analogous-pattern': 0.016,
  'alternative-explanation': 0.012,
};

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((item) => item.length > 2) || []);
}

export function reciprocalRankFusion(lanes: Candidate[][], constant = 60): Map<string, number> {
  const fused = new Map<string, number>();
  for (const lane of lanes) {
    lane.forEach((candidate, index) => {
      fused.set(candidate.publicationId, (fused.get(candidate.publicationId) || 0) + 1 / (constant + index + 1));
    });
  }
  return fused;
}

export function rankLiterature(
  documents: LiteratureDocument[],
  laneResults: Array<{ lane: RetrievalLane; candidates: Candidate[] }>,
  query: string,
  source: RankedLiteratureDocument['retrieval']['source'],
): RankedLiteratureDocument[] {
  const fused = reciprocalRankFusion(laneResults.map((item) => item.candidates));
  const queryTokens = tokens(query);
  const laneMembership = new Map<string, Set<RetrievalLane>>();
  for (const result of laneResults) {
    for (const candidate of result.candidates) {
      const lanes = laneMembership.get(candidate.publicationId) || new Set<RetrievalLane>();
      lanes.add(result.lane);
      laneMembership.set(candidate.publicationId, lanes);
    }
  }

  const scored = documents.map((document) => {
    const documentTokens = tokens(`${document.title} ${document.relevance} ${document.concepts.join(' ')}`);
    const overlap = [...queryTokens].filter((item) => documentTokens.has(item)).length / Math.max(queryTokens.size, 1);
    return {
      document,
      rawScore: (fused.get(document.id) || 0) + roleWeight[document.evidenceRole] + overlap * 0.012,
      lanes: [...(laneMembership.get(document.id) || new Set<RetrievalLane>(['containment']))],
    };
  }).sort((left, right) => right.rawScore - left.rawScore || left.document.id.localeCompare(right.document.id));

  const maximum = scored[0]?.rawScore || 1;
  return scored.map((item, index) => ({
    ...item.document,
    retrieval: {
      rank: index + 1,
      score: Math.max(70, Math.min(98, Math.round(72 + (item.rawScore / maximum) * 24))),
      lanes: item.lanes,
      source,
    },
  }));
}

function fixtureResult(
  bundle: SemanticRuntimeBundle,
  signalId: string,
  profileId: SemanticProfileId,
  query: string,
  startedAt: number,
  reason: string,
): { documents: RankedLiteratureDocument[]; execution: LiteratureQueryExecution } {
  const documents = allLiterature().filter((document) => document.matchedSignalIds.includes(signalId));
  const containment = documents.map((document) => ({ publicationId: document.id }));
  const candidateStatus: RetrievalStageResult['status'] = documents.length ? 'executed' : 'skipped';
  return {
    documents: rankLiterature(documents, [{ lane: 'containment', candidates: containment }], query, 'portable-bundle'),
    execution: {
      mode: 'fixture',
      source: 'portable-bundle',
      semanticReleaseId: bundle.release.releaseId,
      profileId,
      query,
      durationMs: elapsed(startedAt),
      executedAt: new Date().toISOString(),
      stages: [
        { id: 'containment', status: 'fallback', candidateCount: documents.length, durationMs: elapsed(startedAt), detail: reason },
        { id: 'lexical', status: 'skipped', candidateCount: 0, durationMs: 0, detail: 'Atlas Search is unavailable in portable mode.' },
        { id: 'vector', status: 'skipped', candidateCount: 0, durationMs: 0, detail: 'No connected embedding projection was used.' },
        { id: 'graph', status: 'skipped', candidateCount: 0, durationMs: 0, detail: 'The portable release supplies pre-linked evidence.' },
        { id: 'fuse', status: 'fallback', candidateCount: documents.length, durationMs: 0, detail: 'A single governed containment lane was ranked.' },
        { id: 'rerank', status: candidateStatus, candidateCount: documents.length, durationMs: 0, detail: documents.length ? 'Evidence role and terminology overlap were applied.' : 'No governed candidate was available to rerank.' },
        { id: 'hydrate', status: candidateStatus, candidateCount: documents.length, durationMs: 0, detail: documents.length ? 'Attributed fixture metadata was returned.' : 'No governed candidate was available to hydrate.' },
      ],
    },
  };
}

export async function executeLiteratureQuery({
  bundle,
  signalId,
  profileId,
  query,
  limit = 8,
}: {
  bundle: SemanticRuntimeBundle;
  signalId: string;
  profileId: SemanticProfileId;
  query: string;
  limit?: number;
}): Promise<{ documents: RankedLiteratureDocument[]; execution: LiteratureQueryExecution }> {
  const startedAt = Date.now();
  const boundedQuery = query.trim().slice(0, 500) || signalId.replaceAll('-', ' ');
  const database = await solutionDatabase().catch(() => null);
  if (!database) return fixtureResult(bundle, signalId, profileId, boundedQuery, startedAt, 'MongoDB is not configured; the signed portable evidence set was used.');

  const stageResults: RetrievalStageResult[] = [];
  try {
    const containmentStarted = Date.now();
    const stored = await database.collection<LiteratureDocument>('literature_documents').find(
      { matchedSignalIds: signalId },
      { projection: { _id: 0, source: 0, objectStorage: 0, importedAt: 0 }, limit: Math.min(Math.max(limit, 1), 20) },
    ).toArray();
    if (!stored.length) return fixtureResult(bundle, signalId, profileId, boundedQuery, startedAt, 'No connected literature projection matched the governed containment scope.');
    const exact = stored.map((document) => ({ publicationId: document.id }));
    stageResults.push({ id: 'containment', status: 'executed', candidateCount: exact.length, durationMs: elapsed(containmentStarted), detail: `Matched Finding:${signalId} inside the active literature archetype.` });

    const lexicalStarted = Date.now();
    let lexical: Candidate[] = [];
    let lexicalStatus: RetrievalStageResult['status'] = 'executed';
    let lexicalDetail = `Atlas Search index ${process.env.ATLAS_LITERATURE_SEARCH_INDEX || 'safety_literature_search'} executed inside the signal scope.`;
    try {
      lexical = await database.collection<LiteratureChunk>('literature_chunks').aggregate<Candidate>([
        {
          $search: {
            index: process.env.ATLAS_LITERATURE_SEARCH_INDEX || 'safety_literature_search',
            compound: {
              filter: [{ text: { query: signalId, path: 'matchedSignalIds' } }],
              should: [
                { text: { query: boundedQuery, path: 'text', fuzzy: { maxEdits: 1 } } },
                { text: { query: boundedQuery, path: 'concepts' } },
              ],
              minimumShouldMatch: 1,
            },
          },
        },
        { $limit: Math.min(Math.max(limit, 1), 20) },
        { $project: { _id: 0, publicationId: 1, score: { $meta: 'searchScore' } } },
      ]).toArray();
    } catch {
      lexicalStatus = 'fallback';
      lexicalDetail = 'Atlas Search was unavailable; bounded case-insensitive matching was used inside the signal scope.';
      const terms = boundedQuery.match(/[a-z0-9]+/gi)?.filter((item) => item.length > 2).slice(0, 8) || [];
      const pattern = terms.length ? terms.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : '.*';
      lexical = await database.collection<LiteratureChunk>('literature_chunks').find(
        { matchedSignalIds: signalId, text: { $regex: pattern, $options: 'i' } },
        { projection: { _id: 0, publicationId: 1 }, limit: Math.min(Math.max(limit, 1), 20) },
      ).toArray();
    }
    stageResults.push({ id: 'lexical', status: lexicalStatus, candidateCount: lexical.length, durationMs: elapsed(lexicalStarted), detail: lexicalDetail });

    const vectorStarted = Date.now();
    let vector: Candidate[] = [];
    try {
      vector = await database.collection<LiteratureChunk>('literature_chunks').aggregate<Candidate>([
        { $vectorSearch: { index: process.env.ATLAS_LITERATURE_AUTO_EMBED_INDEX || 'safety_literature_auto_embed', path: 'text', query: boundedQuery, filter: { matchedSignalIds: signalId }, numCandidates: 50, limit: Math.min(Math.max(limit, 1), 20) } },
        { $project: { _id: 0, publicationId: 1, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray();
      stageResults.push({ id: 'vector', status: 'executed', candidateCount: vector.length, durationMs: elapsed(vectorStarted), detail: 'Atlas Automated Embedding generated the query vector and searched the licensed, signal-scoped text projection.' });
    } catch {
      stageResults.push({ id: 'vector', status: 'fallback', candidateCount: 0, durationMs: elapsed(vectorStarted), detail: 'The Atlas Automated Embedding lane was unavailable; exact and lexical evidence remain authoritative.' });
    }

    const graphStarted = Date.now();
    let graph: Candidate[] = [];
    try {
      const paths = await database.collection('evidence_relationships').aggregate<Array<{ to: string; descendants: Array<{ to: string }> }>[number]>([
        { $match: { releaseId: bundle.release.releaseId, from: `Finding:${signalId}` } },
        { $graphLookup: { from: 'evidence_relationships', startWith: '$to', connectFromField: 'to', connectToField: 'from', as: 'descendants', maxDepth: 1, depthField: 'depth', restrictSearchWithMatch: { releaseId: bundle.release.releaseId } } },
        { $project: { _id: 0, to: 1, descendants: 1 } },
      ]).toArray();
      const ids = new Set<string>();
      for (const path of paths) {
        if (path.to.startsWith('Publication:')) ids.add(path.to.slice('Publication:'.length));
      }
      graph = [...ids].map((publicationId) => ({ publicationId }));
      stageResults.push({ id: 'graph', status: graph.length ? 'executed' : 'fallback', candidateCount: graph.length, durationMs: elapsed(graphStarted), detail: graph.length ? 'Bounded $graphLookup expanded Finding → Publication → DocumentChunk relationships.' : 'No materialized graph edges were available; document containment remained in force.' });
    } catch {
      stageResults.push({ id: 'graph', status: 'fallback', candidateCount: 0, durationMs: elapsed(graphStarted), detail: 'Graph expansion was unavailable; document containment remained in force.' });
    }

    const fusionStarted = Date.now();
    const lanes: Array<{ lane: RetrievalLane; candidates: Candidate[] }> = [
      { lane: 'containment', candidates: exact },
      ...(lexical.length ? [{ lane: 'lexical' as const, candidates: lexical }] : []),
      ...(vector.length ? [{ lane: 'vector' as const, candidates: vector }] : []),
      ...(graph.length ? [{ lane: 'graph' as const, candidates: graph }] : []),
    ];
    const ranked = rankLiterature(stored, lanes, boundedQuery, 'mongodb');
    stageResults.push({ id: 'fuse', status: lanes.length > 1 ? 'executed' : 'fallback', candidateCount: ranked.length, durationMs: elapsed(fusionStarted), detail: lanes.length > 1 ? `Reciprocal-rank fusion combined ${lanes.length} independently ranked lanes.` : 'Only the exact containment lane produced candidates.' });
    stageResults.push({ id: 'rerank', status: 'executed', candidateCount: ranked.length, durationMs: 0, detail: 'Terminology overlap and evidence role reranked the governed candidate set.' });
    stageResults.push({ id: 'hydrate', status: 'executed', candidateCount: ranked.length, durationMs: 0, detail: 'MongoDB publication records supplied attributed metadata and source locators.' });
    return {
      documents: ranked,
      execution: {
        mode: vector.length ? 'atlas-hybrid' : lexicalStatus === 'executed' && lexical.length ? 'atlas-search' : 'mongodb-exact',
        source: 'mongodb',
        semanticReleaseId: bundle.release.releaseId,
        profileId,
        query: boundedQuery,
        durationMs: elapsed(startedAt),
        executedAt: new Date().toISOString(),
        stages: stageResults,
      },
    };
  } catch {
    return fixtureResult(bundle, signalId, profileId, boundedQuery, startedAt, 'The connected evidence adapter failed closed; the signed portable evidence set was used.');
  }
}
