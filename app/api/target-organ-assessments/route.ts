import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadBiologicalCoherence } from '@/lib/data/coherence-repository';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';
import { listTargetOrganAssessments, recordTargetOrganAssessment } from '@/lib/data/target-organ-assessment-store';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';

const assessmentSchema = z.object({
  studyId: z.string().min(1).max(200),
  snapshotId: z.string().min(1).max(200),
  signalId: z.string().min(1).max(200),
  organ: z.string().min(1).max(200),
  profileId: z.enum(['toxicologist', 'study-director']),
  targetOrganConclusion: z.enum(['TARGET ORGAN', 'NOT TARGET ORGAN', 'INDETERMINATE']),
  adversityDecision: z.enum(['ADVERSE', 'NON-ADVERSE', 'EQUIVOCAL', 'NOT ASSESSED']),
  reversibility: z.enum(['RECOVERED', 'PARTIALLY RECOVERED', 'PERSISTENT', 'NOT ASSESSED']),
  rationale: z.string().min(12).max(4000),
  citedEndpointIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const studyId = url.searchParams.get('studyId');
  if (!studyId) return NextResponse.json({ error: 'studyId is required' }, { status: 400 });
  return NextResponse.json(await listTargetOrganAssessments(studyId, url.searchParams.get('signalId') || undefined));
}

export async function POST(request: Request) {
  const parsed = assessmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target-organ assessment', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const runtime = await loadActiveSemanticBundle();
  const resolver = runtime.resolvers.find((item) => item.id === 'resolver.target-organ-assessment.v1');
  const capability = runtime.capabilities.find((item) => item.id === resolver?.capability);
  const action = runtime.actions.find((item) => item.id === 'assess-target-organ');
  if (!resolver || !capability?.allowedProfiles.includes(input.profileId) || !action?.allowedProfiles.includes(input.profileId)) {
    return NextResponse.json({ error: `Profile ${input.profileId} is not authorized to assess target organs` }, { status: 403 });
  }
  const allowed = (id: string) => new Set(runtime.valueSets.find((valueSet) => valueSet.id === id)?.values || []);
  if (!allowed('target-organ-conclusion').has(input.targetOrganConclusion)
    || !allowed('adversity-decision').has(input.adversityDecision)
    || !allowed('reversibility-decision').has(input.reversibility)) {
    return NextResponse.json({ error: 'Assessment uses a value outside the active semantic release' }, { status: 422 });
  }
  let evidence;
  try {
    evidence = await loadStudyEvidence(input.studyId);
  } catch (error) {
    if (error instanceof StudyEvidenceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  if (evidence.study.snapshotId !== input.snapshotId) return NextResponse.json({ error: 'The requested study snapshot is not active' }, { status: 409 });
  const signal = evidence.signals.find((item) => item.id === input.signalId);
  if (!signal || signal.organ !== input.organ) return NextResponse.json({ error: 'The signal and organ do not match the requested snapshot' }, { status: 404 });
  const coherenceResolver = runtime.resolvers.find((item) => item.id === 'resolver.biological-coherence.v1');
  if (!coherenceResolver) return NextResponse.json({ error: 'The biological-coherence resolver is not installed' }, { status: 503 });
  const coherence = await loadBiologicalCoherence(input.studyId, input.snapshotId, signal, runtime.release.releaseId, coherenceResolver);
  const available = new Map(coherence.targetOrgan.endpointSummaries.map((item) => [item.id, item]));
  const citedEndpoints = input.citedEndpointIds.map((id) => available.get(id));
  if (citedEndpoints.some((item) => !item)) return NextResponse.json({ error: 'Every citation must resolve to an endpoint in the bound study snapshot and organ' }, { status: 422 });
  const citedSourceRecordIds = [...new Set(citedEndpoints.flatMap((item) => item?.sourceRecordIds || []))];
  if (!citedSourceRecordIds.length) return NextResponse.json({ error: 'The assessment requires at least one immutable source-record citation' }, { status: 422 });
  const saved = await recordTargetOrganAssessment({
    apiVersion: 'nonclinical-safety.dev/target-organ-assessment/v1',
    ...input,
    citedSourceRecordIds,
    semanticReleaseId: runtime.release.releaseId,
    resolverId: resolver.id,
    status: input.profileId === 'study-director' ? 'committed' : 'pending-approval',
  });
  return NextResponse.json({
    assessment: saved,
    evidenceMutation: false,
    execution: {
      resolverId: resolver.id,
      capabilityId: capability.id,
      policies: resolver.policy,
      readOperations: coherence.execution.dataOperations,
      writeOperation: { collection: 'target_organ_assessments', operation: 'insertOne', appendOnly: true },
    },
  }, { status: 201 });
}
