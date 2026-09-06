import { NextResponse } from 'next/server';
import type { SemanticProfileId } from '@/lib/contracts';
import { literatureSource } from '@/lib/data/literature-repository';
import { executeLiteratureQuery } from '@/lib/data/literature-query';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import { compileLiteratureQueryPlan } from '@/lib/semantics/query-planner';

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const signalId = parameters.get('signalId');
  if (!signalId) return NextResponse.json({ error: 'signalId is required' }, { status: 400 });
  const profileId = (parameters.get('profile') || 'toxicologist') as SemanticProfileId;
  const query = parameters.get('q') || signalId.replaceAll('-', ' ');
  const limit = Number(parameters.get('limit') || 8);
  const runtime = await loadActiveSemanticBundle();
  try {
    const plan = compileLiteratureQueryPlan(runtime, profileId);
    const result = await executeLiteratureQuery({ bundle: runtime, signalId, profileId, query, limit: Number.isFinite(limit) ? limit : 8 });
    return NextResponse.json({ source: literatureSource(), plan, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Literature query could not be compiled' }, { status: 403 });
  }
}
