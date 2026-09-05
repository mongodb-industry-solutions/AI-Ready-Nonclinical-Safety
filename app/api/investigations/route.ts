import { NextResponse } from 'next/server';
import { z } from 'zod';
import { investigate } from '@/lib/ai/investigator';
import { loadSignalRecordEvidence } from '@/lib/data/evidence-repository';
import { loadStudyEvidence } from '@/lib/data/study-repository';
import { recordInvestigation } from '@/lib/data/review-store';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';

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
  const resolver = runtime.resolvers.find((item) => item.id === 'resolver.evidence-brief.v1');
  const capability = runtime.capabilities.find((item) => item.id === resolver?.capability);
  if (!resolver || !capability?.allowedProfiles.includes(parsed.data.profileId)) {
    return NextResponse.json({ error: `Profile ${parsed.data.profileId} is not authorized to run the AI evidence investigator` }, { status: 403 });
  }
  const evidence = await loadStudyEvidence(parsed.data.studyId);
  const signal = evidence.signals.find((candidate) => candidate.id === parsed.data.signalId) || evidence.signals[0];
  const recordEvidence = await loadSignalRecordEvidence(evidence.study.id, evidence.study.snapshotId, signal);
  const result = await investigate(evidence, parsed.data.signalId, parsed.data.question, parsed.data.profileId, recordEvidence);
  const investigationId = await recordInvestigation({
    studyId: evidence.study.id,
    snapshotId: evidence.study.snapshotId,
    signalId: parsed.data.signalId,
    profileId: parsed.data.profileId,
    question: parsed.data.question,
    result,
  });
  return NextResponse.json({ ...result, investigationId });
}
