import { NextResponse } from 'next/server';
import { z } from 'zod';
import { investigate } from '@/lib/ai/investigator';
import { loadStudyEvidence } from '@/lib/data/study-repository';
import { recordInvestigation } from '@/lib/data/review-store';

const requestSchema = z.object({
  studyId: z.string().min(1).max(200),
  signalId: z.string().min(1).max(200),
  question: z.string().min(3).max(2000),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid investigation request', issues: parsed.error.issues }, { status: 400 });
  }
  const evidence = await loadStudyEvidence(parsed.data.studyId);
  const result = await investigate(evidence, parsed.data.signalId, parsed.data.question);
  const investigationId = await recordInvestigation({
    studyId: evidence.study.id,
    snapshotId: evidence.study.snapshotId,
    signalId: parsed.data.signalId,
    question: parsed.data.question,
    result,
  });
  return NextResponse.json({ ...result, investigationId });
}
