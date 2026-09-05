# Atlas Search and Vector Search Indexes

The application works without Atlas Search indexes. The bundled Magenta service falls back to bounded lexical retrieval. Configure these indexes on `evidence_chunks` to enable hybrid retrieval with reciprocal-rank fusion.

## Search index: `safety_evidence_search`

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "text": { "type": "string" },
      "metadata": { "type": "document", "dynamic": true }
    }
  }
}
```

## Automated Embedding index: `safety_evidence_auto_embed`

```json
{
  "fields": [
    { "type": "autoEmbed", "modality": "text", "path": "text", "model": "voyage-4" },
    { "type": "filter", "path": "studyId" },
    { "type": "filter", "path": "snapshotId" }
  ]
}
```

Atlas generates embeddings asynchronously for existing and changed `text` values and generates the query embedding from the query string. The vectors live in Atlas's reserved `__mdb_internal_search` database, not in the application document, so their absence in Compass's source collection is intentional. Exact incidence and laboratory values always come from structured evidence; vector retrieval only identifies supporting context.

## Literature indexes

`safety_literature_search` indexes `text`, `concepts`, `matchedSignalIds`, and provenance in `literature_chunks`. `safety_literature_auto_embed` automatically embeds `text` with `voyage-4` and permits filters on `matchedSignalIds` and `provenance.pmid`.

`npm run import:literature` materializes attributed publication records, checksum-addressed application summaries, and `Finding → Publication → DocumentChunk` edges. It never calls an external embedding API or writes vector arrays. The vector lane sends the bounded query text to Atlas Automated Embedding; exact, Search and graph retrieval continue to operate if that Preview feature is unavailable.

## Portfolio indexes

Each imported study materializes one compact `portfolio_findings` document per projected signal. It contains semantic concept keys, normalized incidence rates, severity proportions, evidence class, species, source-record references, and the projection digest. `safety_portfolio_search` indexes its text and semantic facets; `safety_portfolio_auto_embed` automatically embeds the text and supports filters for study, organ, species, and evidence class.

The portfolio resolver can therefore retrieve a bounded candidate set before hydrating canonical study evidence. Vector similarity is optional and is never substituted for exact dose, incidence, severity, provenance, or evidence-class checks.

## Semantic-map indexes

The active Context Studio release is materialized as polymorphic `semantic_resources`, separate `semantic_edges`, and one retrieval sidecar named `semantic_search_documents`. The sidecar contains readable semantic text, a resource reference, release identity, resource type, and one explicit profile identity. Profile-specific materialization removes hidden object names before embedding, rather than trying to mask a broader vector after retrieval.

- `semantic_map_search` indexes `text` and `label`, with exact release, type, and profile fields.
- `semantic_map_auto_embed` automatically embeds `text` and filters every query by active release and authorized profile.

`GET /api/semantics/search` runs both lanes and applies reciprocal-rank fusion. Source map documents never contain a vector or empty vector placeholder. Atlas owns the generated values in `__mdb_internal_search`, and a new immutable semantic release produces a new bounded search projection.

Automated Embedding is an Atlas Preview feature and requires the applicable Atlas enablement, model access and billing configuration. `ATLAS_AUTO_EMBED_MODEL` selects the index-time model and defaults to `voyage-4`.

## Operational evidence indexes

`npm run setup:indexes` also ensures conventional compound indexes used by the
biological-coherence resolver. `endpoint_summary_domain` supports complete
snapshot-and-domain scans such as laboratory coverage; `measurement_series_domain`
supports body-weight and exposure retrieval without relying on an organ-prefixed
index. The importer creates the same definitions, so a new environment is correct
whether indexes are established before or during data loading.
