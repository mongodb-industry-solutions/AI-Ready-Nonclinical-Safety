import { createHash } from 'node:crypto';
import process from 'node:process';
import { MongoClient } from 'mongodb';
import { projectOperationalEvidence, projectStudyEvidence } from './lib/study-evidence-projector.mjs';
import { enforceCdiscRecordValidator } from './lib/cdisc-record-validator.mjs';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
const apply = process.argv.includes('--apply');
const tenantId = process.env.CDISC_TENANT_ID || 'public-demo';
const databaseName = process.env.MONGODB_DATABASE || 'nonclinical_safety_solution';
const semanticReleaseId = 'org.contextobjects.nonclinical-safety@1.0.0';
const modelSchemaVersion = '2.0.0';

function compact(value) {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [key, compact(item)]).filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (value === null || value === undefined || value === '') return undefined;
  return value;
}

function fallbackRecordKey(record) {
  const data = record.data || {};
  const domain = record.domain;
  const candidates = ['STUDYID', 'DOMAIN', 'USUBJID', 'SUBJID', `${domain}SEQ`];
  const key = Object.fromEntries(candidates.filter((name) => data[name] !== undefined && data[name] !== '').map((name) => [name, data[name]]));
  return Object.keys(key).length ? key : { sourceId: record.sourceId };
}

function v2Record(record) {
  if (record.canonical && record._control?.modelSchemaVersion === modelSchemaVersion) return record;
  const facets = compact(record.facets);
  const subjectId = facets?.subjectId || record.data?.USUBJID || record.data?.SUBJID;
  const entityRefs = subjectId ? [{ type: 'animalSubject', id: String(subjectId) }] : undefined;
  const standard = record.standard || { family: 'SEND', implementationGuide: 'SENDIG', implementationGuideVersion: '3.0' };
  const sourceDatasetId = record.sourceDatasetId || record.lineage?.sourceDataset;
  const converted = {
    _id: record.sourceId,
    canonical: {
      standard: {
        family: standard.family,
        implementationGuide: standard.implementationGuide,
        version: standard.implementationGuideVersion || standard.version,
      },
      domain: record.domain,
      rowOrdinal: record.rowOrdinal,
      recordKey: compact(record.recordKey) || fallbackRecordKey(record),
      data: compact(record.data),
    },
    _control: {
      tenantId,
      studyId: record.studyId,
      snapshotId: record.snapshotId,
      publicationState: 'published',
      modelSchemaVersion,
      evidencePackageId: record.evidencePackageId,
    },
    _index: {
      ...(facets ? { facets } : {}),
      ...(entityRefs ? { entityRefs } : {}),
      semanticText: record.semantic?.text || `${record.domain} | ${Object.entries(record.data || {}).map(([key, value]) => `${key} ${value}`).join(' | ')}`,
      projectionVersion: record.semantic?.projectionVersion || record.facets?.projectionVersion || '2.0.0',
    },
    _provenance: {
      sourceArtifactId: record.lineage?.sourceArtifactId,
      sourceDatasetId,
      sourceRow: record.lineage?.sourceRow,
      recordHash: record.lineage?.recordHash,
    },
  };
  if (!converted._id || !converted.canonical.domain || !converted.canonical.data || !converted._control.evidencePackageId || !converted._provenance.sourceDatasetId || !converted._provenance.recordHash) {
    throw new Error(`Cannot convert canonical record ${record._id || record.sourceId || '<unknown>'}`);
  }
  return converted;
}

function localId(studyId, snapshotId, value) {
  return `${studyId}:${snapshotId}:${value}`;
}

async function insertBatches(collection, documents, size = 500) {
  for (let offset = 0; offset < documents.length; offset += size) {
    await collection.insertMany(documents.slice(offset, offset + size), { ordered: false });
  }
}

async function replaceProjection(collection, identity, idPrefix, documents, stamp) {
  await collection.deleteMany(identity);
  if (!documents.length) return;
  await collection.insertMany(documents.map((document) => ({
    _id: localId(identity.studyId, identity.snapshotId, `${idPrefix}:${document.id}`),
    ...stamp,
    ...document,
  })));
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(databaseName);
  const current = database.collection('cdisc_records');
  const currentCount = await current.countDocuments();
  const legacyCount = await current.countDocuments({ canonical: { $exists: false } });
  const v2Count = currentCount - legacyCount;
  console.log(`CDISC envelope audit: ${currentCount} records (${legacyCount} v1, ${v2Count} v2).`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to build, reconcile, atomically activate, and remove the v1 collection.');
    process.exit(legacyCount ? 2 : 0);
  }
  if (!legacyCount) {
    console.log('No v1 canonical records remain; migration is already complete.');
    process.exit(0);
  }
  if (v2Count) throw new Error('Mixed v1/v2 canonical collection refused; repair the collection before migration');

  const activePointers = await database.collection('study_snapshot_pointers').find({}).toArray();
  const activeScope = new Set(activePointers.map((pointer) => `${pointer.studyId}\u0000${pointer.activeSnapshotId}`));
  const sourceRecords = await current.find({}).toArray();
  if (sourceRecords.some((record) => !activeScope.has(`${record.studyId}\u0000${record.snapshotId}`))) {
    throw new Error('Canonical rows exist outside active study snapshots; prune or activate them before v2 migration');
  }
  const converted = sourceRecords.map(v2Record);
  if (new Set(converted.map((record) => record._id)).size !== converted.length) throw new Error('The v2 record ids are not globally unique');
  const sourceHash = createHash('sha256').update(sourceRecords.map((record) => record.lineage.recordHash).sort().join('|')).digest('hex');
  const targetHash = createHash('sha256').update(converted.map((record) => record._provenance.recordHash).sort().join('|')).digest('hex');
  if (sourceHash !== targetHash) throw new Error('Record-hash reconciliation failed before activation');

  const buildName = 'cdisc_records_v2_build';
  const retiredName = 'cdisc_records_v1_retired';
  if ((await database.listCollections({ name: buildName }).toArray()).length) await database.collection(buildName).drop();
  if ((await database.listCollections({ name: retiredName }).toArray()).length) await database.collection(retiredName).drop();
  const build = database.collection(buildName);
  await insertBatches(build, converted);
  await build.createIndexes([
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, 'canonical.domain': 1, 'canonical.rowOrdinal': 1 }, name: 'record_domain_order' },
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.subjectId': 1, 'canonical.domain': 1 }, name: 'subject_evidence' },
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.organ': 1, '_index.facets.finding': 1 }, name: 'finding_evidence' },
    { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.testCode': 1, '_index.facets.studyDay': 1 }, name: 'measurement_evidence' },
  ]);
  if (await build.countDocuments() !== currentCount) throw new Error('v2 build collection count does not reconcile');

  await current.rename(retiredName);
  try {
    await build.rename('cdisc_records');
    await enforceCdiscRecordValidator(database);
    const activated = database.collection('cdisc_records');
    if (await activated.countDocuments() !== currentCount) throw new Error('Activated v2 collection count does not reconcile');

    for (const pointer of activePointers) {
      const identity = { studyId: pointer.studyId, snapshotId: pointer.activeSnapshotId };
      const [records, datasets, artifacts, snapshot, previousProjection] = await Promise.all([
        activated.find({ '_control.tenantId': tenantId, '_control.studyId': identity.studyId, '_control.snapshotId': identity.snapshotId }).toArray(),
        database.collection('dataset_definitions').find(identity, { projection: { _id: 0 } }).toArray(),
        database.collection('source_artifacts').find(identity, { projection: { _id: 0 } }).toArray(),
        database.collection('study_snapshots').findOne(identity, { projection: { _id: 0 } }),
        database.collection('study_evidence').findOne({ 'study.id': identity.studyId, 'study.snapshotId': identity.snapshotId }),
      ]);
      const packageId = pointer.evidencePackageId;
      const packageDocument = {
        apiVersion: 'kehrnel.dev/cdisc-solution-evidence/v2',
        kind: 'CDISCSolutionEvidencePackage',
        modelSchemaVersion,
        manifest: {
          studyId: identity.studyId,
          snapshotId: identity.snapshotId,
          packageId,
          standardsPackageId: datasets[0]?.packageId,
          profile: snapshot?.profile || 'send',
          publicationState: 'published',
          contentDigest: previousProjection?.provenance?.evidencePackageDigest || { algorithm: 'sha256', value: packageId.replace(/^sha256:/, '') },
          counts: { records: records.length },
        },
        evidence: { snapshot: snapshot || {}, datasets, sourceArtifacts: artifacts, records },
      };
      const studyEvidence = projectStudyEvidence(packageDocument, { evidenceClass: previousProjection?.study?.evidenceClass });
      const operational = projectOperationalEvidence(packageDocument, { semanticReleaseId });
      const stamp = { ...identity, modelSchemaVersion, evidencePackageId: packageId, projectionVersion: operational.projectionVersion, semanticReleaseId };
      await replaceProjection(database.collection('study_endpoint_summaries'), identity, 'endpoint', operational.endpointSummaries, stamp);
      await replaceProjection(database.collection('measurement_series'), identity, 'series', operational.measurementSeries, stamp);
      await replaceProjection(database.collection('subject_timelines'), identity, 'timeline', operational.subjectTimelines, stamp);
      await replaceProjection(database.collection('evidence_relationships'), identity, 'relationship', operational.evidenceRelationships, stamp);
      await database.collection('study_evidence').replaceOne(
        { 'study.id': identity.studyId, 'study.snapshotId': identity.snapshotId },
        { ...studyEvidence, modelSchemaVersion, importedAt: new Date(), importSource: 'kehrnel-export', evidencePackageId: packageId },
        { upsert: true },
      );
      await database.collection('study_snapshots').updateOne(identity, { $set: { modelSchemaVersion } });
      await database.collection('dataset_definitions').updateMany(identity, { $set: { modelSchemaVersion } });
      await database.collection('evidence_imports').updateOne({ _id: packageId }, { $set: { apiVersion: packageDocument.apiVersion, modelSchemaVersion, semanticReleaseId, migratedAt: new Date() } });
      await database.collection('study_snapshot_pointers').updateOne({ _id: identity.studyId }, { $set: { semanticReleaseId, activatedAt: new Date() } });
      console.log(`Reconciled ${identity.studyId}/${identity.snapshotId}: ${records.length} canonical records and ${operational.endpointSummaries.length} endpoints.`);
    }
    await database.collection(retiredName).drop();
  } catch (error) {
    if ((await database.listCollections({ name: 'cdisc_records' }).toArray()).length) await database.collection('cdisc_records').rename(buildName);
    await database.collection(retiredName).rename('cdisc_records');
    throw error;
  }
  console.log(`Activated CDISC v2: ${currentCount} records, source hashes reconciled, v1 collection removed.`);
} finally {
  await client.close();
}
