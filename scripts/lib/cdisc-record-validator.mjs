export const CDISC_RECORD_MODEL_SCHEMA_VERSION = '2.0.0';

export const cdiscRecordValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['_id', 'canonical', '_control', '_index', '_provenance'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'string', minLength: 1 },
      canonical: {
        bsonType: 'object',
        required: ['standard', 'domain', 'rowOrdinal', 'recordKey', 'data'],
        additionalProperties: false,
        properties: {
          standard: {
            bsonType: 'object',
            required: ['family', 'implementationGuide', 'version'],
            additionalProperties: false,
            properties: {
              family: { bsonType: 'string', minLength: 1 },
              implementationGuide: { bsonType: 'string', minLength: 1 },
              version: { bsonType: 'string', minLength: 1 },
            },
          },
          domain: { bsonType: 'string', minLength: 2 },
          rowOrdinal: { bsonType: ['int', 'long', 'double', 'decimal'] },
          recordKey: { bsonType: 'object', minProperties: 1 },
          data: { bsonType: 'object', minProperties: 1 },
        },
      },
      _control: {
        bsonType: 'object',
        required: ['tenantId', 'studyId', 'snapshotId', 'publicationState', 'modelSchemaVersion', 'evidencePackageId'],
        additionalProperties: false,
        properties: {
          tenantId: { bsonType: 'string', minLength: 1 },
          studyId: { bsonType: 'string', minLength: 1 },
          snapshotId: { bsonType: 'string', minLength: 1 },
          publicationState: { enum: ['published'] },
          modelSchemaVersion: { bsonType: 'string', pattern: '^2\\.' },
          evidencePackageId: { bsonType: 'string', minLength: 1 },
        },
      },
      _index: {
        bsonType: 'object',
        required: ['semanticText', 'projectionVersion'],
        additionalProperties: false,
        properties: {
          facets: { bsonType: 'object', minProperties: 1 },
          entityRefs: { bsonType: 'array', minItems: 1, items: { bsonType: 'object', required: ['type', 'id'] } },
          semanticText: { bsonType: 'string', minLength: 1 },
          projectionVersion: { bsonType: 'string', minLength: 1 },
        },
      },
      _enrichment: {
        bsonType: 'object',
        minProperties: 1,
        additionalProperties: false,
        properties: {
          terminologyBindings: { bsonType: 'array', minItems: 1 },
          reviewedAssertions: { bsonType: 'array', minItems: 1 },
        },
      },
      _provenance: {
        bsonType: 'object',
        required: ['sourceDatasetId', 'sourceRow', 'recordHash'],
        additionalProperties: false,
        properties: {
          sourceArtifactId: { bsonType: 'string', minLength: 1 },
          sourceDatasetId: { bsonType: 'string', minLength: 1 },
          sourceRow: { bsonType: ['int', 'long', 'double', 'decimal'] },
          recordHash: { bsonType: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
        },
      },
    },
  },
};

export async function enforceCdiscRecordValidator(database) {
  await database.command({
    collMod: 'cdisc_records',
    validator: cdiscRecordValidator,
    validationLevel: 'strict',
    validationAction: 'error',
  });
}
