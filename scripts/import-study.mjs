import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { MongoClient } from 'mongodb';

const inputPath = process.argv[2];
const projectionPath = process.argv[3];
if (!inputPath) throw new Error('Usage: npm run import:study -- <solution-evidence-package.json> [study-evidence.json]');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function validateStudyEvidence(value) {
  if (!value?.study?.id || !value?.study?.snapshotId || !Array.isArray(value?.signals)) {
    throw new Error('Study projection must satisfy the StudyEvidence contract');
  }
  return value;
}

function validatePackage(value) {
  const document = requireObject(value, 'Evidence package');
  if (document.apiVersion !== 'kehrnel.dev/cdisc-solution-evidence/v1') {
    throw new Error(`Unsupported evidence package apiVersion: ${document.apiVersion || 'missing'}`);
  }
  if (document.kind !== 'CDISCSolutionEvidencePackage') throw new Error('Invalid evidence package kind');
  if (!/^1\./.test(String(document.modelSchemaVersion || ''))) {
    throw new Error(`Unsupported modelSchemaVersion: ${document.modelSchemaVersion || 'missing'}`);
  }
  const manifest = requireObject(document.manifest, 'manifest');
  const evidence = requireObject(document.evidence, 'evidence');
  if (!manifest.studyId || !manifest.snapshotId || manifest.publicationState !== 'published') {
    throw new Error('Only a named, published study snapshot can be imported');
  }
  const digest = sha256(canonicalJson(evidence));
  if (manifest.contentDigest?.algorithm !== 'sha256' || manifest.contentDigest?.value !== digest) {
    throw new Error('Evidence package content digest does not match its payload');
  }
  for (const key of ['datasets', 'records', 'entities', 'materializations', 'sourceArtifacts', 'validationRuns', 'validationFindings', 'transformations']) {
    const values = requireArray(evidence[key], `evidence.${key}`);
    if (manifest.counts?.[key] !== values.length) throw new Error(`Manifest count mismatch for ${key}`);
  }
  return document;
}

function localId(studyId, snapshotId, sourceId) {
  return `${studyId}:${snapshotId}:${sourceId}`;
}

function evidenceChunks(projection) {
  return [
    ...projection.signals.map((signal) => ({
      chunkId: `MI:${signal.id}`,
      studyId: projection.study.id,
      snapshotId: projection.study.snapshotId,
      domain: 'MI',
      text: `${signal.organ}: ${signal.finding}. Pattern ${signal.pattern}; ${signal.affectedAnimals} of ${signal.totalAnimals} animals affected.`,
      sourceRef: `${projection.study.snapshotId}:MI:${signal.id}`,
      metadata: signal,
    })),
    ...Object.entries(projection.labSeries || {}).map(([testCode, series]) => ({
      chunkId: `LB:${testCode}`,
      studyId: projection.study.id,
      snapshotId: projection.study.snapshotId,
      domain: 'LB',
      text: `${series.label} (${testCode}) longitudinal group means in ${series.unit}.`,
      sourceRef: `${projection.study.snapshotId}:LB:${testCode}`,
      metadata: { testCode, ...series },
    })),
  ];
}

async function upsertMany(collection, documents) {
  if (!documents.length) return;
  await collection.bulkWrite(documents.map((document) => ({
    updateOne: { filter: { _id: document._id }, update: { $set: document }, upsert: true },
  })), { ordered: false });
}

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const isPackage = input?.apiVersion === 'kehrnel.dev/cdisc-solution-evidence/v1';
const packageDocument = isPackage ? validatePackage(input) : null;
const projection = projectionPath
  ? validateStudyEvidence(JSON.parse(await readFile(projectionPath, 'utf8')))
  : (!isPackage ? validateStudyEvidence(input) : null);

if (packageDocument && projection && (
  projection.study.id !== packageDocument.manifest.studyId
  || projection.study.snapshotId !== packageDocument.manifest.snapshotId
)) {
  throw new Error('Study projection identity does not match the evidence package');
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');

  if (packageDocument) {
    const { manifest, evidence, modelSchemaVersion } = packageDocument;
    const identity = { studyId: manifest.studyId, snapshotId: manifest.snapshotId };
    const stamp = { ...identity, modelSchemaVersion, evidencePackageId: manifest.packageId };
    await upsertMany(database.collection('study_snapshots'), [{
      _id: localId(manifest.studyId, manifest.snapshotId, 'snapshot'), ...stamp, ...evidence.snapshot, importState: 'verified',
    }]);
    await upsertMany(database.collection('dataset_definitions'), evidence.datasets.map((item) => ({
      _id: localId(manifest.studyId, manifest.snapshotId, item.sourceId || item.domain), ...stamp, ...item,
    })));
    await upsertMany(database.collection('cdisc_records'), evidence.records.map((item) => ({
      _id: localId(manifest.studyId, manifest.snapshotId, item.sourceId), ...stamp, ...item,
    })));
    await upsertMany(database.collection('subjects'), evidence.entities
      .filter((item) => item.entityType === 'animalSubject' || item.entityType === 'humanSubject')
      .map((item) => ({
        _id: localId(manifest.studyId, manifest.snapshotId, `subject:${item.entityId}`),
        ...stamp,
        subjectId: item.entityId,
        subjectType: item.entityType === 'animalSubject' ? 'animal' : 'human',
        domains: item.domains || [],
        sourceRecordIds: item.recordIds || [],
        recordCount: item.recordCount || 0,
        projectionBuildId: item.projectionBuildId,
        projectionVersion: item.projectionVersion,
      })));
    await upsertMany(database.collection('source_artifacts'), evidence.sourceArtifacts.map((item) => ({
      _id: localId(manifest.studyId, manifest.snapshotId, item.sourceId || item.digest?.value), ...stamp, ...item,
    })));
    await upsertMany(database.collection('validation_evidence'), [
      ...evidence.validationRuns.map((item) => ({
        _id: localId(manifest.studyId, manifest.snapshotId, `run:${item.sourceId || item.runId}`), ...stamp, evidenceType: 'validation-run', ...item,
      })),
      ...evidence.validationFindings.map((item) => ({
        _id: localId(manifest.studyId, manifest.snapshotId, `finding:${item.sourceId}`), ...stamp, evidenceType: 'validation-finding', ...item,
      })),
    ]);
    await upsertMany(database.collection('lineage_events'), evidence.transformations.map((item) => ({
      _id: localId(manifest.studyId, manifest.snapshotId, item.sourceId || item.executionId), ...stamp, ...item,
    })));

    await database.collection('study_snapshots').createIndex({ studyId: 1, snapshotId: 1 }, { name: 'study_snapshot', unique: true });
    await database.collection('dataset_definitions').createIndex({ studyId: 1, snapshotId: 1, domain: 1 }, { name: 'dataset_domain', unique: true });
    await database.collection('cdisc_records').createIndexes([
      { key: { studyId: 1, snapshotId: 1, domain: 1, rowOrdinal: 1 }, name: 'record_domain_order' },
      { key: { studyId: 1, snapshotId: 1, 'facets.subjectId': 1, domain: 1 }, name: 'subject_evidence' },
      { key: { studyId: 1, snapshotId: 1, 'facets.organ': 1, 'facets.finding': 1 }, name: 'finding_evidence' },
      { key: { studyId: 1, snapshotId: 1, 'facets.testCode': 1, 'facets.studyDay': 1 }, name: 'laboratory_evidence' },
    ]);
    await database.collection('subjects').createIndex({ studyId: 1, snapshotId: 1, subjectId: 1 }, { name: 'subject_identity', unique: true });
    await database.collection('source_artifacts').createIndex({ studyId: 1, snapshotId: 1, 'digest.value': 1 }, { name: 'artifact_digest' });
    await database.collection('evidence_imports').updateOne(
      { _id: manifest.packageId },
      { $set: { ...stamp, apiVersion: packageDocument.apiVersion, counts: manifest.counts, contentDigest: manifest.contentDigest, status: 'complete', importedAt: new Date() } },
      { upsert: true },
    );
  }

  if (projection) {
    await database.collection('study_evidence').updateOne(
      { 'study.id': projection.study.id, 'study.snapshotId': projection.study.snapshotId },
      { $set: { ...projection, modelSchemaVersion: packageDocument?.modelSchemaVersion || '1.0.0', importedAt: new Date(), importSource: packageDocument ? 'kehrnel-export' : 'solution-api', evidencePackageId: packageDocument?.manifest.packageId } },
      { upsert: true },
    );
    const chunks = evidenceChunks(projection);
    if (chunks.length) {
      await database.collection('evidence_chunks').bulkWrite(chunks.map((chunk) => ({
        updateOne: {
          filter: { studyId: chunk.studyId, snapshotId: chunk.snapshotId, domain: chunk.domain, chunkId: chunk.chunkId },
          update: { $set: chunk },
          upsert: true,
        },
      })), { ordered: false });
    }
  }

  const name = packageDocument
    ? `${packageDocument.manifest.studyId}/${packageDocument.manifest.snapshotId}: ${packageDocument.manifest.counts.records} canonical records, ${packageDocument.manifest.counts.sourceArtifacts} source artifacts${projection ? ', plus the solution read model' : ''}`
    : `${projection.study.id}/${projection.study.snapshotId}: solution read model`;
  console.log(`Imported ${name}.`);
} finally {
  await client.close();
}
