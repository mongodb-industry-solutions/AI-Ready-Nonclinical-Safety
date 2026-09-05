import { NextResponse } from 'next/server';
import { z } from 'zod';
import { investigate } from '@/lib/ai/investigator';
import { loadSignalRecordEvidence } from '@/lib/data/evidence-repository';
import { loadBiologicalCoherence } from '@/lib/data/coherence-repository';
import { executeLiteratureQuery } from '@/lib/data/literature-query';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';
import { recordInvestigation } from '@/lib/data/review-store';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import { searchSemanticMap } from '@/lib/semantics/search';
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
  let evidence;
  try {
    evidence = await loadStudyEvidence(parsed.data.studyId, recordQuery);
  } catch (error) {
    if (error instanceof StudyEvidenceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
  const signal = evidence.signals.find((candidate) => candidate.id === parsed.data.signalId);
  if (!signal) {
    return NextResponse.json({ error: `Signal ${parsed.data.signalId} was not found in study ${parsed.data.studyId}` }, { status: 404 });
  }
  const coherenceResolver = runtime.resolvers.find((item) => item.id === 'resolver.biological-coherence.v1');
  const coherenceCapability = runtime.capabilities.find((item) => item.id === coherenceResolver?.capability);
  const semanticCapability = runtime.capabilities.find((item) => item.id === 'inspect-semantic-model');
  const literatureResolver = runtime.resolvers.find((item) => item.id === 'resolver.literature-evidence.v1');
  const literatureCapability = runtime.capabilities.find((item) => item.id === literatureResolver?.capability);
  const semanticQuery = `${signal.organ} ${signal.finding}. ${parsed.data.question}`;
  const [recordEvidence, coherence, semanticGrounding, literatureEvidence] = await Promise.all([
    loadSignalRecordEvidence(evidence.study.id, evidence.study.snapshotId, signal, recordQuery),
    coherenceResolver && coherenceCapability?.allowedProfiles.includes(parsed.data.profileId)
      ? loadBiologicalCoherence(evidence.study.id, evidence.study.snapshotId, signal, runtime.release.releaseId, coherenceResolver)
      : undefined,
    semanticCapability?.allowedProfiles.includes(parsed.data.profileId)
      ? searchSemanticMap({ bundle: runtime, profileId: parsed.data.profileId, query: semanticQuery, limit: 8 })
        .then((result) => ({ releaseId: runtime.release.releaseId, profileId: parsed.data.profileId, ...result }))
      : undefined,
    literatureResolver && literatureCapability?.allowedProfiles.includes(parsed.data.profileId)
      ? executeLiteratureQuery({ bundle: runtime, signalId: signal.id, profileId: parsed.data.profileId, query: semanticQuery, limit: 8 })
      : undefined,
  ]);
  if (coherence) dataOperations.push(...coherence.execution.dataOperations);
  const result = await investigate(evidence, parsed.data.signalId, parsed.data.question, parsed.data.profileId, recordEvidence, coherence, semanticGrounding, literatureEvidence);
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
      retrievalExecutions: {
        ...(semanticGrounding ? { semantic: {
          mode: semanticGrounding.mode,
          query: semanticGrounding.query,
          stages: semanticGrounding.stages,
          managedEmbedding: semanticGrounding.managedEmbedding,
        } } : {}),
        ...(literatureEvidence ? { literature: literatureEvidence.execution } : {}),
      },
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
    signalId: signal.id,
    profileId: parsed.data.profileId,
    question: parsed.data.question,
    result: executed,
  });
  return NextResponse.json({ ...executed, investigationId });
}
