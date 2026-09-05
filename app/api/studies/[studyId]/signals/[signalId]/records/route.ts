import { NextResponse } from 'next/server';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';
import { loadSignalRecordEvidence } from '@/lib/data/evidence-repository';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ studyId: string; signalId: string }> }) {
  const { studyId: encodedStudyId, signalId: encodedSignalId } = await context.params;
  const studyId = decodeURIComponent(encodedStudyId);
  const signalId = decodeURIComponent(encodedSignalId);
  let evidence;
  try {
    evidence = await loadStudyEvidence(studyId);
  } catch (error) {
    if (error instanceof StudyEvidenceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  const signal = evidence.signals.find((item) => item.id === signalId);
  if (!signal) return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  return NextResponse.json(await loadSignalRecordEvidence(studyId, evidence.study.snapshotId, signal));
}
