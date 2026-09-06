import { NextResponse } from 'next/server';
import { loadCanonicalRecordPage } from '@/lib/data/evidence-repository';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ studyId: string }> }) {
  const { studyId: encodedStudyId } = await context.params;
  const studyId = decodeURIComponent(encodedStudyId);
  let evidence;
  try {
    evidence = await loadStudyEvidence(studyId);
  } catch (error) {
    if (error instanceof StudyEvidenceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim().toUpperCase();
  const scope = searchParams.get('scope') === 'study' ? 'study' : 'subject';
  const subjectId = searchParams.get('subjectId') || undefined;
  const requestedFilter = searchParams.get('filter') || 'all';
  const filter = (['all', 'outside-range', 'linked-test', 'unassessed', 'source-records'].includes(requestedFilter) ? requestedFilter : 'all') as 'all' | 'outside-range' | 'linked-test' | 'unassessed' | 'source-records';
  const linkedTestCode = searchParams.get('linkedTestCode') || undefined;
  const testCode = searchParams.get('testCode')?.trim().toUpperCase() || undefined;
  const sourceRecordIds = (searchParams.get('sourceIds') || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 250);
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));

  if (!/^[A-Z0-9]{1,8}$/.test(domain)) return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 });
  if (testCode && !/^[A-Z0-9_]{1,16}$/.test(testCode)) return NextResponse.json({ error: 'A valid laboratory test code is required' }, { status: 400 });
  if (scope === 'subject' && !subjectId) return NextResponse.json({ error: 'subjectId is required for subject scope' }, { status: 400 });

  return NextResponse.json(await loadCanonicalRecordPage(studyId, evidence.study.snapshotId, { domain, scope, subjectId, filter, linkedTestCode, testCode, sourceRecordIds, offset, limit }));
}
