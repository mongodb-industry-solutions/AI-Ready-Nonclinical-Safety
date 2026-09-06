import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

const source = JSON.parse(await readFile(new URL('../data/literature-evidence.json', import.meta.url), 'utf8'));
const semanticRuntime = JSON.parse(await readFile(new URL('../semantic/nonclinical-safety-runtime.json', import.meta.url), 'utf8'));
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  const documents = database.collection('literature_documents');
  const chunks = database.collection('literature_chunks');
  const edges = database.collection('evidence_relationships');
  const semanticReleaseId = process.env.SEMANTIC_RELEASE_ID || semanticRuntime?.release?.releaseId;
  if (!semanticReleaseId) throw new Error('The compiled semantic runtime does not declare release.releaseId');
  const chunkRows = source.documents.map((publication) => ({
    id: `${publication.id}-relevance`,
    schemaVersion: publication.schemaVersion,
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

  for (const [index, publication] of source.documents.entries()) {
    const chunk = chunkRows[index];
    const stored = {
      ...publication,
      source: source.source,
      ...(process.env.DOCUMENT_BUCKET ? { objectStorage: { provider: 's3-compatible', bucket: process.env.DOCUMENT_BUCKET, objectKey: `literature/${publication.pmid}/source.pdf`, status: 'reference-only' } } : {}),
      importedAt: new Date(),
    };
    await documents.replaceOne({ id: publication.id }, stored, { upsert: true });
    await chunks.replaceOne({ id: chunk.id }, chunk, { upsert: true });
    for (const signalId of publication.matchedSignalIds) {
      await edges.replaceOne({ id: `finding:${signalId}:publication:${publication.id}` }, {
        id: `finding:${signalId}:publication:${publication.id}`,
        schemaVersion: publication.schemaVersion,
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
      schemaVersion: publication.schemaVersion,
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
  console.log(`Imported ${source.documents.length} attributed PubMed records, evidence summaries, and semantic graph paths; Atlas owns automated embeddings for the text projection.`);
} finally {
  await client.close();
}
