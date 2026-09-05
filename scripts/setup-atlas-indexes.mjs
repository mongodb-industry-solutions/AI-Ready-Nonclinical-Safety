import process from 'node:process';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const searchName = process.env.ATLAS_SEARCH_INDEX || 'safety_evidence_search';
const evidenceAutoEmbedName = process.env.ATLAS_EVIDENCE_AUTO_EMBED_INDEX || 'safety_evidence_auto_embed';
const literatureSearchName = process.env.ATLAS_LITERATURE_SEARCH_INDEX || 'safety_literature_search';
const literatureAutoEmbedName = process.env.ATLAS_LITERATURE_AUTO_EMBED_INDEX || 'safety_literature_auto_embed';
const portfolioSearchName = process.env.ATLAS_PORTFOLIO_SEARCH_INDEX || 'safety_portfolio_search';
const portfolioAutoEmbedName = process.env.ATLAS_PORTFOLIO_AUTO_EMBED_INDEX || 'safety_portfolio_auto_embed';
const embeddingModel = process.env.ATLAS_AUTO_EMBED_MODEL || 'voyage-4';
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

  if (!existing.has(evidenceAutoEmbedName)) {
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
  if (!literatureIndexes.has(literatureAutoEmbedName)) {
    await literature.createSearchIndex({
      name: literatureAutoEmbedName,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'autoEmbed', modality: 'text', path: 'text', model: embeddingModel },
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
  if (!portfolioIndexes.has(portfolioAutoEmbedName)) {
    await portfolio.createSearchIndex({
      name: portfolioAutoEmbedName,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'autoEmbed', modality: 'text', path: 'text', model: embeddingModel },
          { type: 'filter', path: 'studyId' },
          { type: 'filter', path: 'organ' },
          { type: 'filter', path: 'species' },
          { type: 'filter', path: 'evidenceClass' },
        ],
      },
    });
  }

  console.log(`Atlas indexes requested: ${searchName}, ${evidenceAutoEmbedName}, ${literatureSearchName}, ${literatureAutoEmbedName}, ${portfolioSearchName}, ${portfolioAutoEmbedName}`);
} finally {
  await client.close();
}
