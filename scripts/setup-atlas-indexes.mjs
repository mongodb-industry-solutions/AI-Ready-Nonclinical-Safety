import process from 'node:process';
import { MongoClient } from 'mongodb';
import { enforceCdiscRecordValidator } from './lib/cdisc-record-validator.mjs';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const searchName = process.env.ATLAS_SEARCH_INDEX || 'safety_evidence_search';
const evidenceAutoEmbedName = process.env.ATLAS_EVIDENCE_AUTO_EMBED_INDEX || 'safety_evidence_auto_embed';
const literatureSearchName = process.env.ATLAS_LITERATURE_SEARCH_INDEX || 'safety_literature_search';
const literatureAutoEmbedName = process.env.ATLAS_LITERATURE_AUTO_EMBED_INDEX || 'safety_literature_auto_embed';
const portfolioSearchName = process.env.ATLAS_PORTFOLIO_SEARCH_INDEX || 'safety_portfolio_search';
const portfolioAutoEmbedName = process.env.ATLAS_PORTFOLIO_AUTO_EMBED_INDEX || 'safety_portfolio_auto_embed';
const semanticSearchName = process.env.ATLAS_SEMANTIC_SEARCH_INDEX || 'semantic_map_search';
const semanticAutoEmbedName = process.env.ATLAS_SEMANTIC_AUTO_EMBED_INDEX || 'semantic_map_auto_embed';
const embeddingModel = process.env.ATLAS_AUTO_EMBED_MODEL || 'voyage-4';
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  await enforceCdiscRecordValidator(database);
  const canonicalRecords = database.collection('cdisc_records');
  const supersededCanonicalIndexes = new Set(['record_source_identity', 'record_domain_order_v2', 'subject_evidence_v2', 'finding_evidence_v2', 'laboratory_evidence', 'measurement_evidence_v2']);
  for (const index of await canonicalRecords.listIndexes().toArray()) {
    if (supersededCanonicalIndexes.has(index.name)) await canonicalRecords.dropIndex(index.name);
  }
  await canonicalRecords.createIndexes([
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, 'canonical.domain': 1, 'canonical.rowOrdinal': 1 }, name: 'record_domain_order' },
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.subjectId': 1, 'canonical.domain': 1 }, name: 'subject_evidence' },
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.organ': 1, '_index.facets.finding': 1 }, name: 'finding_evidence' },
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.testCode': 1, '_index.facets.studyDay': 1 }, name: 'measurement_evidence' },
  ]);
  await database.collection('study_endpoint_summaries').createIndexes([
    { key: { studyId: 1, snapshotId: 1, domain: 1, testCode: 1 }, name: 'endpoint_summary_domain' },
  ]);
  await database.collection('measurement_series').createIndexes([
    { key: { studyId: 1, snapshotId: 1, domain: 1, testCode: 1, sex: 1, phase: 1 }, name: 'measurement_series_domain' },
  ]);
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

  const semantic = database.collection('semantic_search_documents');
  const semanticIndexDocuments = await semantic.listSearchIndexes().toArray();
  const semanticIndexes = new Set(semanticIndexDocuments.map((index) => index.name));
  const semanticSearchDefinition = {
    mappings: {
      dynamic: false,
      fields: {
        text: { type: 'string' },
        label: { type: 'string' },
        releaseId: { type: 'string', analyzer: 'lucene.keyword' },
        resourceType: { type: 'string', analyzer: 'lucene.keyword' },
        profileId: { type: 'string', analyzer: 'lucene.keyword' },
      },
    },
  };
  if (!semanticIndexes.has(semanticSearchName)) {
    await semantic.createSearchIndex({
      name: semanticSearchName,
      definition: semanticSearchDefinition,
    });
  } else if (!JSON.stringify(semanticIndexDocuments.find((index) => index.name === semanticSearchName)?.latestDefinition || {}).includes('profileId')) {
    await semantic.updateSearchIndex(semanticSearchName, semanticSearchDefinition);
  }
  const semanticAutoEmbedDefinition = {
    fields: [
      { type: 'autoEmbed', modality: 'text', path: 'text', model: embeddingModel },
      { type: 'filter', path: 'releaseId' },
      { type: 'filter', path: 'resourceType' },
      { type: 'filter', path: 'profileId' },
    ],
  };
  if (!semanticIndexes.has(semanticAutoEmbedName)) {
    await semantic.createSearchIndex({
      name: semanticAutoEmbedName,
      type: 'vectorSearch',
      definition: semanticAutoEmbedDefinition,
    });
  } else if (!JSON.stringify(semanticIndexDocuments.find((index) => index.name === semanticAutoEmbedName)?.latestDefinition || {}).includes('profileId')) {
    await semantic.updateSearchIndex(semanticAutoEmbedName, semanticAutoEmbedDefinition);
  }

  console.log(`Atlas indexes requested: ${searchName}, ${evidenceAutoEmbedName}, ${literatureSearchName}, ${literatureAutoEmbedName}, ${portfolioSearchName}, ${portfolioAutoEmbedName}, ${semanticSearchName}, ${semanticAutoEmbedName}; operational indexes ensured: endpoint_summary_domain, measurement_series_domain`);
} finally {
  await client.close();
}
