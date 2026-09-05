import { NextResponse } from 'next/server';
import { loadCanonicalRecordPage } from '@/lib/data/evidence-repository';
import { loadStudyEvidence } from '@/lib/data/study-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ studyId: string }> }) {
  const { studyId: encodedStudyId } = await context.params;
  const studyId = decodeURIComponent(encodedStudyId);
  const evidence = await loadStudyEvidence(studyId);
  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim().toUpperCase();
  const scope = searchParams.get('scope') === 'study' ? 'study' : 'subject';
  const subjectId = searchParams.get('subjectId') || undefined;
  const requestedFilter = searchParams.get('filter') || 'all';
  const filter = (['all', 'outside-range', 'linked-test', 'unassessed'].includes(requestedFilter) ? requestedFilter : 'all') as 'all' | 'outside-range' | 'linked-test' | 'unassessed';
  const linkedTestCode = searchParams.get('linkedTestCode') || undefined;
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));

  if (!/^[A-Z0-9]{1,8}$/.test(domain)) return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 });
  if (scope === 'subject' && !subjectId) return NextResponse.json({ error: 'subjectId is required for subject scope' }, { status: 400 });

  return NextResponse.json(await loadCanonicalRecordPage(studyId, evidence.study.snapshotId, { domain, scope, subjectId, filter, linkedTestCode, offset, limit }));
}
