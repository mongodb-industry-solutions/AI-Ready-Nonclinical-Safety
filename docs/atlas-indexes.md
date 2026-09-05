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

## Vector index: `safety_evidence_vector`

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "studyId" },
    { "type": "filter", "path": "snapshotId" }
  ]
}
```

Embeddings are generated lazily for the selected immutable snapshot. Exact incidence and laboratory values always come from structured evidence; vector retrieval only identifies supporting context.

## Literature indexes

`safety_literature_search` indexes `text`, `concepts`, `matchedSignalIds`, and provenance in `literature_chunks`. `safety_literature_vector` indexes the 1,536-dimension `embedding` field and permits filters on `matchedSignalIds` and `provenance.pmid`.

`npm run import:literature` always materializes attributed publication records, checksum-addressed application summaries, and `Finding → Publication → DocumentChunk` edges. When `OPENAI_API_KEY` is configured, it also generates chunk embeddings with `OPENAI_EMBEDDING_MODEL`; otherwise the vector lane is explicitly reported as skipped while exact, Search and graph retrieval continue to operate.
