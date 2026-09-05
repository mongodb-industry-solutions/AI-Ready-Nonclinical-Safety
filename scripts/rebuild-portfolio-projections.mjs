import process from 'node:process';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

function localId(studyId, snapshotId, signalId) {
  return `${studyId}:${snapshotId}:finding:${signalId}`;
}

function projectFinding(evidence, signal) {
  const inferredEvidenceClass = evidence.study.evidenceClass
    || (String(evidence.study.source || '').includes('phuse-org/SENDConform') ? 'observed-public' : 'sponsor-observed');
  return {
    _id: localId(evidence.study.id, evidence.study.snapshotId, signal.id),
    studyId: evidence.study.id,
    snapshotId: evidence.study.snapshotId,
    evidenceClass: inferredEvidenceClass,
    species: evidence.study.species,
    strain: evidence.study.strain,
    signalId: signal.id,
    organ: signal.organ,
    finding: signal.finding,
    text: `${signal.organ}. ${signal.finding}. ${signal.pattern}. ${signal.correlatedLab ? `Correlated laboratory test ${signal.correlatedLab}.` : ''}`.trim(),
    semanticConcepts: [`anatomic-site:${signal.organ}`, `finding-morphology:${signal.id}`],
    incidenceRates: evidence.doseGroups.map((group, index) => (signal.incidence[index] || 0) / Math.max(group.animalCount, 1)),
    severity: signal.severity,
    correlatedLab: signal.correlatedLab,
    sourceRecordIds: signal.sourceRecordIds || [],
    evidencePackageId: evidence.provenance?.evidencePackageId,
    projectionDigest: evidence.provenance?.projectionDigest,
    ...(Array.isArray(signal.embedding) ? { embedding: signal.embedding } : {}),
  };
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  const studies = await database.collection('study_evidence').find({}, { projection: { _id: 0 } }).toArray();
  const findings = studies.flatMap((evidence) => evidence.signals.map((signal) => projectFinding(evidence, signal)));
  if (findings.length) {
    await database.collection('portfolio_findings').bulkWrite(findings.map((finding) => ({
      replaceOne: { filter: { _id: finding._id }, replacement: finding, upsert: true },
    })), { ordered: false });
  }
  await database.collection('portfolio_findings').createIndexes([
    { key: { studyId: 1, snapshotId: 1, signalId: 1 }, name: 'portfolio_finding_identity', unique: true },
    { key: { organ: 1, species: 1, strain: 1, evidenceClass: 1 }, name: 'portfolio_semantic_scope' },
  ]);
  console.log(`Rebuilt ${findings.length} portfolio finding projections from ${studies.length} study snapshots.`);
} finally {
  await client.close();
}
