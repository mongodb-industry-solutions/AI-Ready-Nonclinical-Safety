import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { MongoClient } from 'mongodb';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: npm run import:study -- ./study-evidence.json');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

const evidence = JSON.parse(await readFile(inputPath, 'utf8'));
if (!evidence?.study?.id || !evidence?.study?.snapshotId || !Array.isArray(evidence?.signals)) {
  throw new Error('Input must satisfy the StudyEvidence contract');
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
try {
  const database = client.db(process.env.MONGODB_DATABASE || 'nonclinical_safety_solution');
  await database.collection('study_evidence').updateOne(
    { 'study.id': evidence.study.id, 'study.snapshotId': evidence.study.snapshotId },
    { $set: { ...evidence, importedAt: new Date(), importSource: 'solution-api' } },
    { upsert: true },
  );

  const chunks = [
    ...evidence.signals.map((signal) => ({
      chunkId: `MI:${signal.id}`,
      studyId: evidence.study.id,
      snapshotId: evidence.study.snapshotId,
      domain: 'MI',
      text: `${signal.organ}: ${signal.finding}. Pattern ${signal.pattern}; ${signal.affectedAnimals} of ${signal.totalAnimals} animals affected.`,
      sourceRef: `${evidence.study.snapshotId}:MI:${signal.id}`,
      metadata: signal,
    })),
    ...Object.entries(evidence.labSeries || {}).map(([testCode, series]) => ({
      chunkId: `LB:${testCode}`,
      studyId: evidence.study.id,
      snapshotId: evidence.study.snapshotId,
      domain: 'LB',
      text: `${series.label} (${testCode}) longitudinal group means in ${series.unit}.`,
      sourceRef: `${evidence.study.snapshotId}:LB:${testCode}`,
      metadata: { testCode, ...series },
    })),
  ];
  if (chunks.length) {
    await database.collection('evidence_chunks').bulkWrite(
      chunks.map((chunk) => ({
        updateOne: {
          filter: { studyId: chunk.studyId, snapshotId: chunk.snapshotId, chunkId: chunk.chunkId },
          update: { $set: chunk },
          upsert: true,
        },
      })),
    );
  }
  console.log(`Imported ${evidence.study.id}/${evidence.study.snapshotId} with ${chunks.length} evidence chunks.`);
} finally {
  await client.close();
}
