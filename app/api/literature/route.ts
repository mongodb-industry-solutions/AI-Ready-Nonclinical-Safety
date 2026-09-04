import { NextResponse } from 'next/server';
import { literatureSource, relatedLiterature } from '@/lib/data/literature-repository';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import { compileLiteratureQueryPlan } from '@/lib/semantics/query-planner';

export async function GET(request: Request) {
  const signalId = new URL(request.url).searchParams.get('signalId');
  if (!signalId) return NextResponse.json({ error: 'signalId is required' }, { status: 400 });
  const runtime = await loadActiveSemanticBundle();
  return NextResponse.json({ source: literatureSource(), plan: compileLiteratureQueryPlan(runtime), documents: relatedLiterature(signalId) });
}
