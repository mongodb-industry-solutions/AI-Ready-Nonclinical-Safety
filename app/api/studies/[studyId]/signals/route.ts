import { NextResponse } from 'next/server';
import { loadStudyEvidence } from '@/lib/data/study-repository';

export async function GET(_request: Request, context: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await context.params;
  const evidence = await loadStudyEvidence(decodeURIComponent(studyId));
  return NextResponse.json(evidence);
}
