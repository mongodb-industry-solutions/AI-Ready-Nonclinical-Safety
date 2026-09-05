# 03 · Bounded retrieval projections

## Problem

The reflex when adding AI to an evidence store is to embed every row. For CDISC
that means embedding ~35,000 near-identical records whose text is largely
`"MI | STUDYID 1234 | USUBJID 5004 | MISTRESC infiltration, mononuclear cell"`.

This is worse than useless:

- Cost and index size scale with row count, not with meaning.
- Recall *drops*, because thousands of nearly identical vectors crowd each other
  and the nearest neighbour is noise.
- It is the wrong tool. Exact dose, incidence, severity, subject, test code and
  study day are **predicates**, not similarity questions. They belong in an index.

## Pattern

Split the question. Answer exact predicates from `_index.facets`; generate
semantic candidates only from coherent, bounded *text* projections:

| Collection | One document per | Text it carries |
|---|---|---|
| `evidence_chunks` | finding / laboratory context | finding narrative and its dose-response context |
| `portfolio_findings` | study signal | organ, morphology, pattern, correlated test |
| `literature_chunks` | permitted passage | section-aware external literature |
| `semantic_search_documents` | semantic-map resource, per profile | concept, archetype, resolver definitions |

Each projection retains filter fields, source references and projection lineage,
so a vector hit can always be reconnected to canonical rows.

Vectors are produced by **Atlas Automated Embedding**, indexed over the governed
`text` field:

```javascript
await collection.createSearchIndex({
  name: evidenceAutoEmbedName,
  type: 'vectorSearch',
  definition: {
    fields: [
      { type: 'autoEmbed', modality: 'text', path: 'text', model: embeddingModel },
      { type: 'filter', path: 'studyId' },
      { type: 'filter', path: 'snapshotId' },
    ],
  },
});
```

Two consequences worth knowing before you look for them:

- Vectors live in Atlas's reserved `__mdb_internal_search` database, **not** as
  arrays on your documents. Their absence in Compass is correct, not a bug.
- Query text is embedded by Atlas at query time with the same model, so no
  client-side embedding path exists — and deliberately no second, manual one.

## Why

- Retrieval quality comes from projecting *meaningful units*, not from volume.
- The exact lane stays authoritative: counts and measurements are never inferred
  from a similarity score.
- Embedding cost tracks the number of concepts, which is stable, rather than the
  number of rows, which is not.

## When *not* to use it

- **When rows genuinely are the semantic unit** — free-text clinical notes,
  pathology narratives, adverse-event descriptions. Embed those directly.
- **When you need per-row semantic recall for audit** rather than for discovery.
- **When Automated Embedding is unavailable** in your Atlas tier or region. Keep
  the lexical and exact lanes working and label the vector lane as skipped —
  which this solution does rather than silently degrading. See
  [pattern 04](04-reconciled-derived-projections.md) on making that visible.

## In this repository

- Index definitions: [`scripts/setup-atlas-indexes.mjs`](../scripts/setup-atlas-indexes.mjs), documented in [`docs/atlas-indexes.md`](../docs/atlas-indexes.md)
- Chunk generation: [`scripts/import-study.mjs`](../scripts/import-study.mjs)
- Hybrid query with reciprocal-rank fusion: [`lib/semantics/search.ts`](../lib/semantics/search.ts), [`lib/data/literature-query.ts`](../lib/data/literature-query.ts)
- Current scale: ~35k canonical records back 76 evidence chunks, 75 portfolio findings and 3 literature chunks.
