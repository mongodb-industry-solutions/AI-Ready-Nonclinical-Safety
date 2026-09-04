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
