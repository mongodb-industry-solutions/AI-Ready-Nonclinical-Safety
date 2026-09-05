import process from 'node:process';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const searchName = process.env.ATLAS_SEARCH_INDEX || 'safety_evidence_search';
const vectorName = process.env.ATLAS_VECTOR_INDEX || 'safety_evidence_vector';
const literatureSearchName = process.env.ATLAS_LITERATURE_SEARCH_INDEX || 'safety_literature_search';
const literatureVectorName = process.env.ATLAS_LITERATURE_VECTOR_INDEX || 'safety_literature_vector';
const portfolioSearchName = process.env.ATLAS_PORTFOLIO_SEARCH_INDEX || 'safety_portfolio_search';
const portfolioVectorName = process.env.ATLAS_PORTFOLIO_VECTOR_INDEX || 'safety_portfolio_vector';
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

  const literature = database.collection('literature_chunks');
  const literatureIndexes = new Set((await literature.listSearchIndexes().toArray()).map((index) => index.name));
  if (!literatureIndexes.has(literatureSearchName)) {
    await literature.createSearchIndex({
      name: literatureSearchName,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            text: { type: 'string' },
            concepts: { type: 'string' },
            matchedSignalIds: { type: 'string' },
            provenance: { type: 'document', dynamic: true },
          },
        },
      },
    });
  }
  if (!literatureIndexes.has(literatureVectorName)) {
    await literature.createSearchIndex({
      name: literatureVectorName,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'matchedSignalIds' },
          { type: 'filter', path: 'provenance.pmid' },
        ],
      },
    });
  }

  const portfolio = database.collection('portfolio_findings');
  const portfolioIndexes = new Set((await portfolio.listSearchIndexes().toArray()).map((index) => index.name));
  if (!portfolioIndexes.has(portfolioSearchName)) {
    await portfolio.createSearchIndex({
      name: portfolioSearchName,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            text: { type: 'string' },
            organ: { type: 'string', analyzer: 'lucene.keyword' },
            finding: { type: 'string' },
            semanticConcepts: { type: 'string' },
            evidenceClass: { type: 'string', analyzer: 'lucene.keyword' },
            species: { type: 'string', analyzer: 'lucene.keyword' },
          },
        },
      },
    });
  }
  if (!portfolioIndexes.has(portfolioVectorName)) {
    await portfolio.createSearchIndex({
      name: portfolioVectorName,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
          { type: 'filter', path: 'studyId' },
          { type: 'filter', path: 'organ' },
          { type: 'filter', path: 'species' },
          { type: 'filter', path: 'evidenceClass' },
        ],
      },
    });
  }

  console.log(`Atlas indexes requested: ${searchName}, ${vectorName}, ${literatureSearchName}, ${literatureVectorName}, ${portfolioSearchName}, ${portfolioVectorName}`);
} finally {
  await client.close();
}
