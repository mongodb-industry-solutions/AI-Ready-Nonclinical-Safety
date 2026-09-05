import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

const source = JSON.parse(await readFile(new URL('../data/literature-evidence.json', import.meta.url), 'utf8'));
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  const documents = database.collection('literature_documents');
  const chunks = database.collection('literature_chunks');
  const edges = database.collection('semantic_evidence_edges');
  const semanticReleaseId = process.env.SEMANTIC_RELEASE_ID || 'org.contextobjects.nonclinical-safety@0.1.0';
  const chunkRows = source.documents.map((publication) => ({
    id: `${publication.id}-relevance`,
    publicationId: publication.id,
    text: `${publication.title}. ${publication.relevance}`,
    concepts: publication.concepts,
    matchedSignalIds: publication.matchedSignalIds,
    sourceRef: `PubMed:${publication.pmid}:application-summary`,
    locator: { kind: 'application-summary', section: 'relevance' },
    contentHash: `sha256:${createHash('sha256').update(`${publication.title}. ${publication.relevance}`).digest('hex')}`,
    contentRights: 'bibliographic-metadata-and-application-summary',
    provenance: { provider: 'PubMed', pmid: publication.pmid, url: publication.url },
  }));
  let embeddings = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: chunkRows.map((row) => row.text), dimensions: 1536 }),
      });
      if (!response.ok) throw new Error(`embedding request failed (${response.status})`);
      const payload = await response.json();
      embeddings = payload.data.sort((left, right) => left.index - right.index).map((item) => item.embedding);
    } catch (error) {
      console.warn(`Literature embeddings were not generated: ${error instanceof Error ? error.message : 'unknown provider error'}`);
    }
  }

  for (const [index, publication] of source.documents.entries()) {
    const chunk = chunkRows[index];
    const stored = {
      ...publication,
      source: source.source,
      objectStorage: process.env.DOCUMENT_BUCKET ? { provider: 's3-compatible', bucket: process.env.DOCUMENT_BUCKET, objectKey: `literature/${publication.pmid}/source.pdf`, status: 'reference-only' } : null,
      importedAt: new Date(),
    };
    await documents.replaceOne({ id: publication.id }, stored, { upsert: true });
    await chunks.replaceOne({ id: chunk.id }, {
      ...chunk,
      ...(embeddings?.[index] ? { embedding: embeddings[index], embeddingStatus: 'ready', embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small' } : { embeddingStatus: 'pending-model-configuration' }),
    }, { upsert: true });
    for (const signalId of publication.matchedSignalIds) {
      await edges.replaceOne({ id: `finding:${signalId}:publication:${publication.id}` }, {
        id: `finding:${signalId}:publication:${publication.id}`,
        releaseId: semanticReleaseId,
        from: `Finding:${signalId}`,
        to: `Publication:${publication.id}`,
        predicate: 'safety:contextualizedByLiterature',
        evidenceRole: publication.evidenceRole,
        source: { provider: 'PubMed', pmid: publication.pmid },
      }, { upsert: true });
    }
    await edges.replaceOne({ id: `publication:${publication.id}:chunk:${chunk.id}` }, {
      id: `publication:${publication.id}:chunk:${chunk.id}`,
      releaseId: semanticReleaseId,
      from: `Publication:${publication.id}`,
      to: `DocumentChunk:${chunk.id}`,
      predicate: 'safety:hasEvidencePassage',
      source: { provider: 'application-summary', contentHash: chunk.contentHash },
    }, { upsert: true });
  }
  await documents.createIndex({ pmid: 1 }, { unique: true, name: 'pubmed_id' });
  await documents.createIndex({ matchedSignalIds: 1, evidenceRole: 1 }, { name: 'signal_evidence_role' });
  await chunks.createIndex({ publicationId: 1, matchedSignalIds: 1 }, { name: 'literature_lineage' });
  await edges.createIndex({ releaseId: 1, from: 1, predicate: 1, to: 1 }, { name: 'semantic_edge_forward', unique: true });
  await edges.createIndex({ releaseId: 1, to: 1, predicate: 1, from: 1 }, { name: 'semantic_edge_reverse' });
  console.log(`Imported ${source.documents.length} attributed PubMed records, evidence summaries, and semantic graph paths${embeddings ? ' with embeddings' : ''}.`);
} finally {
  await client.close();
}
