import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listReviewActions, recordReviewAction } from '@/lib/data/review-store';
import { canPerformSemanticAction, isSemanticProfile, semanticRuntimeBundle } from '@/lib/semantics/runtime';

const reviewSchema = z.object({
  studyId: z.string().min(1).max(200),
  snapshotId: z.string().min(1).max(200),
  signalId: z.string().min(1).max(200),
  profile: z.string(),
  action: z.string().min(1).max(100),
  note: z.string().min(3).max(4000),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const studyId = url.searchParams.get('studyId');
  if (!studyId) return NextResponse.json({ error: 'studyId is required' }, { status: 400 });
  return NextResponse.json(await listReviewActions(studyId, url.searchParams.get('signalId') || undefined));
}

export async function POST(request: Request) {
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSemanticProfile(parsed.data?.profile)) {
    return NextResponse.json({ error: 'Invalid governed review action' }, { status: 400 });
  }
  const { profile, action } = parsed.data;
  if (!canPerformSemanticAction(profile, action)) {
    return NextResponse.json({ error: `Profile ${profile} is not authorized for ${action}` }, { status: 403 });
  }
  const contract = semanticRuntimeBundle().actions.find((candidate) => candidate.id === action)!;
  const status = contract.approval === 'none' ? 'committed' : 'pending-approval';
  const saved = await recordReviewAction({ ...parsed.data, profile, status });
  return NextResponse.json({ record: saved, contract, evidenceMutation: false }, { status: 201 });
}
