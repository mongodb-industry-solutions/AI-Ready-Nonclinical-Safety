import { NextResponse } from 'next/server';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';

export async function GET(_request: Request, context: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await context.params;
  try {
    return NextResponse.json(await loadStudyEvidence(decodeURIComponent(studyId)));
  } catch (error) {
    if (error instanceof StudyEvidenceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
