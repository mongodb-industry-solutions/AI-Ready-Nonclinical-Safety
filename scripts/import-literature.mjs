import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';

const source = JSON.parse(await readFile(new URL('../data/literature-evidence.json', import.meta.url), 'utf8'));
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  const documents = database.collection('literature_documents');
  const chunks = database.collection('literature_chunks');
  for (const publication of source.documents) {
    const stored = {
      ...publication,
      source: source.source,
      objectStorage: process.env.DOCUMENT_BUCKET ? { provider: 's3-compatible', bucket: process.env.DOCUMENT_BUCKET, objectKey: `literature/${publication.pmid}/source.pdf`, status: 'reference-only' } : null,
      importedAt: new Date(),
    };
    await documents.replaceOne({ id: publication.id }, stored, { upsert: true });
    await chunks.replaceOne({ id: `${publication.id}-relevance` }, {
      id: `${publication.id}-relevance`,
      publicationId: publication.id,
      text: `${publication.title}. ${publication.relevance}`,
      concepts: publication.concepts,
      matchedSignalIds: publication.matchedSignalIds,
      locator: { kind: 'application-summary', section: 'relevance' },
      embeddingStatus: 'pending-model-configuration',
      provenance: { provider: 'PubMed', pmid: publication.pmid, url: publication.url },
    }, { upsert: true });
  }
  await documents.createIndex({ pmid: 1 }, { unique: true, name: 'pubmed_id' });
  await documents.createIndex({ matchedSignalIds: 1, evidenceRole: 1 }, { name: 'signal_evidence_role' });
  await chunks.createIndex({ publicationId: 1, matchedSignalIds: 1 }, { name: 'literature_lineage' });
  console.log(`Imported ${source.documents.length} attributed PubMed records and application-authored evidence summaries.`);
} finally {
  await client.close();
}
