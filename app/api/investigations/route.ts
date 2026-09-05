import { NextResponse } from 'next/server';
import { z } from 'zod';
import { investigate } from '@/lib/ai/investigator';
import { loadSignalRecordEvidence } from '@/lib/data/evidence-repository';
import { loadStudyEvidence } from '@/lib/data/study-repository';
import { recordInvestigation } from '@/lib/data/review-store';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import type { DataQueryTrace } from '@/lib/contracts';

const requestSchema = z.object({
  studyId: z.string().min(1).max(200),
  signalId: z.string().min(1).max(200),
  profileId: z.enum(['toxicologist', 'study-director', 'data-steward', 'portfolio-lead', 'external-reviewer']).default('toxicologist'),
  question: z.string().min(3).max(2000),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid investigation request', issues: parsed.error.issues }, { status: 400 });
  }
  const runtime = await loadActiveSemanticBundle();
  const resolver = runtime.resolvers.find((item) => item.id === 'resolver.investigate-safety-signal.v1');
  const capability = runtime.capabilities.find((item) => item.id === resolver?.capability);
  if (!resolver || !capability?.allowedProfiles.includes(parsed.data.profileId)) {
    return NextResponse.json({ error: `Profile ${parsed.data.profileId} is not authorized to run the AI evidence investigator` }, { status: 403 });
  }
  const dataOperations: DataQueryTrace[] = [];
  const recordQuery = (trace: DataQueryTrace) => dataOperations.push(trace);
  const evidence = await loadStudyEvidence(parsed.data.studyId, recordQuery);
  const signal = evidence.signals.find((candidate) => candidate.id === parsed.data.signalId) || evidence.signals[0];
  const recordEvidence = await loadSignalRecordEvidence(evidence.study.id, evidence.study.snapshotId, signal, recordQuery);
  const result = await investigate(evidence, parsed.data.signalId, parsed.data.question, parsed.data.profileId, recordEvidence);
  const readCollections = [...new Set(dataOperations.filter((operation) => operation.source === 'mongodb' && operation.status === 'executed').map((operation) => operation.collection))];
  const predicates = dataOperations.reduce<Record<string, Array<Record<string, unknown>>>>((byCollection, operation) => {
    if (!byCollection[operation.collection]) byCollection[operation.collection] = [];
    byCollection[operation.collection].push(operation.predicate);
    return byCollection;
  }, {});
  const executed = {
    ...result,
    execution: {
      apiVersion: 'nonclinical-safety.dev/investigation-execution/v1' as const,
      resolverId: resolver.id,
      capabilityId: capability.id,
      semanticReleaseId: runtime.release.releaseId,
      executor: resolver.executor,
      inputSchema: resolver.input,
      outputSchema: resolver.output,
      policies: resolver.policy,
      declaredStages: resolver.stages,
      executedStages: result.steps,
      dataOperations,
      executedAt: new Date().toISOString(),
      boundScope: {
        studyId: evidence.study.id,
        snapshotId: evidence.study.snapshotId,
        signalId: signal.id,
        profileId: parsed.data.profileId,
      },
      queryShape: {
        readCollections,
        auditWriteCollection: 'investigations' as const,
        predicates,
        immutableEvidence: true as const,
      },
    },
  };
  const investigationId = await recordInvestigation({
    studyId: evidence.study.id,
    snapshotId: evidence.study.snapshotId,
    signalId: parsed.data.signalId,
    profileId: parsed.data.profileId,
    question: parsed.data.question,
    result: executed,
  });
  return NextResponse.json({ ...executed, investigationId });
}
