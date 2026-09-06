import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { MongoClient } from 'mongodb';
import { enforceCdiscRecordValidator } from './lib/cdisc-record-validator.mjs';
import { projectOperationalEvidence, projectStudyEvidence } from './lib/study-evidence-projector.mjs';

const arguments_ = process.argv.slice(2);
const inputPath = arguments_.find((value) => !value.startsWith('--'));
const evidenceClassArgument = arguments_.find((value) => value.startsWith('--evidence-class='));
const selectedEvidenceClass = evidenceClassArgument?.split('=')[1];
const replaceSnapshot = arguments_.includes('--replace-snapshot');
const allowedEvidenceClasses = ['observed-public', 'synthetic-benchmark', 'sponsor-observed'];
if (!inputPath) throw new Error('Usage: npm run import:study -- <cdisc-solution-evidence-v2.json> [--evidence-class=synthetic-benchmark] [--replace-snapshot]');
if (selectedEvidenceClass && !allowedEvidenceClasses.includes(selectedEvidenceClass)) throw new Error(`Unsupported evidence class: ${selectedEvidenceClass}`);
if (arguments_.some((value) => value !== inputPath && value !== evidenceClassArgument && value !== '--replace-snapshot')) throw new Error('A separate business projection is not accepted; package imports derive and reconcile StudyEvidence automatically');
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

function validatePackage(value) {
  const document = requireObject(value, 'Evidence package');
  if (document.apiVersion !== 'kehrnel.dev/cdisc-solution-evidence/v2') {
    throw new Error(`Unsupported evidence package apiVersion: ${document.apiVersion || 'missing'}`);
  }
  if (document.kind !== 'CDISCSolutionEvidencePackage') throw new Error('Invalid evidence package kind');
  if (!/^2\./.test(String(document.modelSchemaVersion || ''))) {
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
  for (const [index, record] of evidence.records.entries()) {
    if (!record?._id || !record?.canonical || !record?._control || !record?._index || !record?._provenance) {
      throw new Error(`evidence.records[${index}] does not satisfy the CDISC v2 envelope`);
    }
    if (record._control.studyId !== manifest.studyId || record._control.snapshotId !== manifest.snapshotId || record._control.evidencePackageId !== manifest.packageId) {
      throw new Error(`evidence.records[${index}] control scope does not match the package manifest`);
    }
    if (!/^2\./.test(String(record._control.modelSchemaVersion || '')) || record._control.publicationState !== 'published') {
      throw new Error(`evidence.records[${index}] is not a published modelSchemaVersion 2 record`);
    }
    if (!record.canonical.domain || !record.canonical.data || !record.canonical.recordKey || !record._index.semanticText || !record._provenance.recordHash) {
      throw new Error(`evidence.records[${index}] omits required canonical, retrieval, or provenance content`);
    }
    for (const [label, optional] of [['_index.facets', record._index.facets], ['_index.entityRefs', record._index.entityRefs], ['_enrichment', record._enrichment]]) {
      if (optional && Object.keys(optional).length === 0) throw new Error(`evidence.records[${index}] persists empty optional field ${label}`);
    }
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

function portfolioFindings(projection) {
  return projection.signals.map((signal) => ({
    _id: localId(projection.study.id, projection.study.snapshotId, `finding:${signal.id}`),
    studyId: projection.study.id,
    snapshotId: projection.study.snapshotId,
    evidenceClass: projection.study.evidenceClass || 'sponsor-observed',
    ...(projection.study.species ? { species: projection.study.species } : {}),
    ...(projection.study.strain ? { strain: projection.study.strain } : {}),
    signalId: signal.id,
    organ: signal.organ,
    finding: signal.finding,
    text: `${signal.organ}. ${signal.finding}. ${signal.pattern}. ${signal.correlatedLab ? `Correlated laboratory test ${signal.correlatedLab}.` : ''}`.trim(),
    semanticConcepts: [`anatomic-site:${signal.organ}`, `finding-morphology:${signal.id}`],
    incidenceRates: projection.doseGroups.map((group, index) => (signal.incidence[index] || 0) / Math.max(group.animalCount, 1)),
    severity: signal.severity,
    ...(signal.correlatedLab ? { correlatedLab: signal.correlatedLab } : {}),
    ...(signal.sourceRecordIds?.length ? { sourceRecordIds: signal.sourceRecordIds } : {}),
    ...(projection.provenance.evidencePackageId ? { evidencePackageId: projection.provenance.evidencePackageId } : {}),
    ...(projection.provenance.projectionDigest ? { projectionDigest: projection.provenance.projectionDigest } : {}),
  }));
}

const IMPORT_BATCH_SIZE = Math.max(50, Number.parseInt(process.env.IMPORT_BATCH_SIZE || '500', 10) || 500);
const IMPORT_BATCH_RETRIES = Math.max(0, Number.parseInt(process.env.IMPORT_BATCH_RETRIES || '4', 10) || 4);

function retryableImportError(error) {
  return Boolean(
    error?.hasErrorLabel?.('RetryableWriteError')
    || error?.hasErrorLabel?.('ResetPool')
    || /timed out|ECONNRESET|connection closed|server selection/i.test(String(error?.message || error)),
  );
}

async function upsertMany(collection, documents) {
  if (!documents.length) return;
  for (let offset = 0; offset < documents.length; offset += IMPORT_BATCH_SIZE) {
    const batch = documents.slice(offset, offset + IMPORT_BATCH_SIZE);
    let attempt = 0;
    while (true) {
      try {
        await collection.bulkWrite(batch.map((document) => ({
          replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true },
        })), { ordered: false });
        break;
      } catch (error) {
        if (attempt >= IMPORT_BATCH_RETRIES || !retryableImportError(error)) throw error;
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
      }
    }
  }
}

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const packageDocument = validatePackage(input);
const projection = projectStudyEvidence(packageDocument, { evidenceClass: selectedEvidenceClass });
const semanticRuntime = JSON.parse(await readFile(new URL('../semantic/nonclinical-safety-runtime.json', import.meta.url), 'utf8'));
const semanticReleaseId = semanticRuntime?.release?.releaseId;
if (!semanticReleaseId) throw new Error('The compiled semantic runtime does not declare release.releaseId');
const operational = projectOperationalEvidence(packageDocument, { semanticReleaseId });

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  await enforceCdiscRecordValidator(database);
  const targetTenantId = process.env.CDISC_TENANT_ID || 'public-demo';

  if (packageDocument) {
    const { manifest, evidence, modelSchemaVersion } = packageDocument;
    const identity = { studyId: manifest.studyId, snapshotId: manifest.snapshotId };
    const stamp = { ...identity, modelSchemaVersion, evidencePackageId: manifest.packageId };
    const existingSnapshot = await database.collection('study_snapshots').findOne(identity, { projection: { evidencePackageId: 1 } });
    if (existingSnapshot?.evidencePackageId && existingSnapshot.evidencePackageId !== manifest.packageId && !replaceSnapshot) {
      throw new Error(`Snapshot ${manifest.studyId}/${manifest.snapshotId} is already bound to ${existingSnapshot.evidencePackageId}; publish a new snapshot id or use --replace-snapshot for a guarded staging migration`);
    }
    if (replaceSnapshot) {
      const protectedCollections = ['investigations', 'review_actions', 'target_organ_assessments'];
      const protectedCounts = await Promise.all(protectedCollections.map(async (collectionName) => ({
        collectionName,
        count: await database.collection(collectionName).countDocuments(identity, { limit: 1 }),
      })));
      const protectedState = protectedCounts.filter((item) => item.count > 0);
      if (protectedState.length) {
        throw new Error(`Snapshot replacement refused because governed solution state exists in ${protectedState.map((item) => item.collectionName).join(', ')}`);
      }
      await database.collection('evidence_imports').updateMany(
        { ...identity, _id: { $ne: manifest.packageId } },
        { $set: { status: 'superseded', supersededBy: manifest.packageId, supersededAt: new Date() } },
      );
      const snapshotMirrorCollections = [
        'study_snapshots',
        'dataset_definitions',
        'cdisc_records',
        'subjects',
        'source_artifacts',
        'validation_evidence',
        'lineage_events',
        'study_endpoint_summaries',
        'measurement_series',
        'subject_timelines',
        'evidence_relationships',
        'study_evidence',
        'evidence_chunks',
        'portfolio_findings',
      ];
      for (const collectionName of snapshotMirrorCollections) {
        await database.collection(collectionName).deleteMany(identity);
      }
    }
    await database.collection('evidence_imports').updateOne(
      { _id: manifest.packageId },
      { $set: { ...stamp, apiVersion: packageDocument.apiVersion, counts: manifest.counts, contentDigest: manifest.contentDigest, status: 'loading', startedAt: new Date() } },
      { upsert: true },
    );
    await upsertMany(database.collection('study_snapshots'), [{
      _id: localId(manifest.studyId, manifest.snapshotId, 'snapshot'), ...stamp, ...evidence.snapshot, importState: 'verified',
    }]);
    await upsertMany(database.collection('dataset_definitions'), evidence.datasets.map((item) => ({
      _id: localId(manifest.studyId, manifest.snapshotId, item.sourceId || item.domain), ...stamp, ...item,
    })));
    await upsertMany(database.collection('cdisc_records'), evidence.records.map((item) => ({
      ...item,
      _control: { ...item._control, tenantId: targetTenantId },
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
    const canonicalRecords = database.collection('cdisc_records');
    const obsoleteRecordIndexes = new Set(['record_source_identity', 'record_domain_order_v2', 'subject_evidence_v2', 'finding_evidence_v2', 'laboratory_evidence', 'measurement_evidence_v2']);
    for (const index of await canonicalRecords.listIndexes().toArray()) {
      if (obsoleteRecordIndexes.has(index.name)) await canonicalRecords.dropIndex(index.name);
    }
    await canonicalRecords.createIndexes([
      { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, 'canonical.domain': 1, 'canonical.rowOrdinal': 1 }, name: 'record_domain_order' },
      { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.subjectId': 1, 'canonical.domain': 1 }, name: 'subject_evidence' },
      { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.organ': 1, '_index.facets.finding': 1 }, name: 'finding_evidence' },
      { key: { '_control.tenantId': 1, '_control.studyId': 1, '_control.snapshotId': 1, '_index.facets.testCode': 1, '_index.facets.studyDay': 1 }, name: 'measurement_evidence' },
    ]);
    await database.collection('subjects').createIndex({ studyId: 1, snapshotId: 1, subjectId: 1 }, { name: 'subject_identity', unique: true });
    await database.collection('source_artifacts').createIndex({ studyId: 1, snapshotId: 1, 'digest.value': 1 }, { name: 'artifact_digest' });
    const operationalStamp = {
      ...stamp,
      projectionVersion: operational.projectionVersion,
      semanticReleaseId: operational.semanticReleaseId,
    };
    const operationalCollections = [
      ['study_endpoint_summaries', 'endpoint', operational.endpointSummaries],
      ['measurement_series', 'series', operational.measurementSeries],
      ['subject_timelines', 'timeline', operational.subjectTimelines],
      ['evidence_relationships', 'relationship', operational.evidenceRelationships],
    ];
    for (const [collectionName, idPrefix, documents] of operationalCollections) {
      const collection = database.collection(collectionName);
      await collection.deleteMany(identity);
      await upsertMany(collection, documents.map((document) => ({
        _id: localId(manifest.studyId, manifest.snapshotId, `${idPrefix}:${document.id}`),
        ...operationalStamp,
        ...document,
      })));
    }
    await database.collection('study_endpoint_summaries').createIndexes([
      { key: { studyId: 1, snapshotId: 1, id: 1 }, name: 'endpoint_summary_identity', unique: true },
      { key: { studyId: 1, snapshotId: 1, organ: 1, domain: 1, testCode: 1, sex: 1, phase: 1, 'group.code': 1 }, name: 'endpoint_summary_scope' },
      { key: { studyId: 1, snapshotId: 1, domain: 1, testCode: 1 }, name: 'endpoint_summary_domain' },
    ]);
    await database.collection('measurement_series').createIndexes([
      { key: { studyId: 1, snapshotId: 1, id: 1 }, name: 'measurement_series_identity', unique: true },
      { key: { studyId: 1, snapshotId: 1, organ: 1, domain: 1, testCode: 1, sex: 1, phase: 1 }, name: 'measurement_series_scope' },
      { key: { studyId: 1, snapshotId: 1, domain: 1, testCode: 1, sex: 1, phase: 1 }, name: 'measurement_series_domain' },
    ]);
    await database.collection('subject_timelines').createIndexes([
      { key: { studyId: 1, snapshotId: 1, subjectId: 1 }, name: 'subject_timeline_identity', unique: true },
      { key: { studyId: 1, snapshotId: 1, 'group.code': 1, sex: 1, 'events.phase': 1 }, name: 'subject_timeline_phase' },
    ]);
    await database.collection('evidence_relationships').createIndexes([
      { key: { studyId: 1, snapshotId: 1, id: 1 }, name: 'evidence_relationship_identity', unique: true },
      { key: { studyId: 1, snapshotId: 1, from: 1, predicate: 1, to: 1 }, name: 'evidence_relationship_from_to' },
      { key: { studyId: 1, snapshotId: 1, subjectId: 1, authority: 1 }, name: 'evidence_relationship_subject' },
    ]);
  }

  await database.collection('study_evidence').replaceOne(
    { 'study.id': projection.study.id, 'study.snapshotId': projection.study.snapshotId },
    {
      ...projection,
      modelSchemaVersion: packageDocument.modelSchemaVersion,
      importedAt: new Date(),
      importSource: 'kehrnel-export',
      evidencePackageId: packageDocument.manifest.packageId,
    },
    { upsert: true },
  );
  const chunks = evidenceChunks(projection);
  if (chunks.length) {
    await database.collection('evidence_chunks').bulkWrite(chunks.map((chunk) => ({
      replaceOne: {
        filter: { studyId: chunk.studyId, snapshotId: chunk.snapshotId, domain: chunk.domain, chunkId: chunk.chunkId },
        replacement: chunk,
        upsert: true,
      },
    })), { ordered: false });
  }
  await upsertMany(database.collection('portfolio_findings'), portfolioFindings(projection));
  await database.collection('portfolio_findings').createIndexes([
    { key: { studyId: 1, snapshotId: 1, signalId: 1 }, name: 'portfolio_finding_identity', unique: true },
    { key: { organ: 1, species: 1, strain: 1, evidenceClass: 1 }, name: 'portfolio_semantic_scope' },
  ]);

  if (packageDocument) {
    const { manifest, modelSchemaVersion } = packageDocument;
    await database.collection('study_snapshot_pointers').updateOne(
      { _id: manifest.studyId },
      { $set: {
        studyId: manifest.studyId,
        activeSnapshotId: manifest.snapshotId,
        evidencePackageId: manifest.packageId,
        semanticReleaseId,
        activatedAt: new Date(),
      } },
      { upsert: true },
    );
    await database.collection('evidence_imports').updateOne(
      { _id: manifest.packageId },
      { $set: {
        studyId: manifest.studyId,
        snapshotId: manifest.snapshotId,
        modelSchemaVersion,
        evidencePackageId: manifest.packageId,
        semanticReleaseId,
        operationalProjection: operational.reconciliation,
        status: 'complete',
        importedAt: new Date(),
      } },
    );
  }

  const name = `${packageDocument.manifest.studyId}/${packageDocument.manifest.snapshotId}: ${packageDocument.manifest.counts.records} canonical records, ${packageDocument.manifest.counts.sourceArtifacts} source artifacts, ${operational.endpointSummaries.length} endpoint summaries, ${operational.measurementSeries.length} measurement series, ${operational.subjectTimelines.length} subject timelines, and ${operational.evidenceRelationships.length} evidence relationships`;
  console.log(`Imported ${name}.`);
} finally {
  await client.close();
}
