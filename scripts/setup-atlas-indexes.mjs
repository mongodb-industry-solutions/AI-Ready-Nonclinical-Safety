import process from 'node:process';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const searchName = process.env.ATLAS_SEARCH_INDEX || 'safety_evidence_search';
const vectorName = process.env.ATLAS_VECTOR_INDEX || 'safety_evidence_vector';
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  const collection = database.collection('evidence_chunks');
  const existing = new Set((await collection.listSearchIndexes().toArray()).map((index) => index.name));

  if (!existing.has(searchName)) {
    await collection.createSearchIndex({
      name: searchName,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            text: { type: 'string' },
            metadata: { type: 'document', dynamic: true },
          },
        },
      },
    });
  }

  if (!existing.has(vectorName)) {
    await collection.createSearchIndex({
      name: vectorName,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'studyId' },
          { type: 'filter', path: 'snapshotId' },
        ],
      },
    });
  }

  console.log(`Atlas indexes requested: ${searchName}, ${vectorName}`);
} finally {
  await client.close();
}
