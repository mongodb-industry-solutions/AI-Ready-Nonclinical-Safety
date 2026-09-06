import { NextRequest, NextResponse } from 'next/server';
import { comparePortfolio } from '@/lib/analysis/portfolio-similarity';
import { loadPortfolioVectorScores } from '@/lib/data/portfolio-query';
import { loadPortfolioEvidence } from '@/lib/data/study-repository';
import { loadSemanticRuntimeForProfile } from '@/lib/semantics/repository';
import type { DataQueryTrace, SemanticProfileId } from '@/lib/contracts';

const profiles: SemanticProfileId[] = ['toxicologist', 'study-director', 'data-steward', 'portfolio-lead', 'external-reviewer'];

export async function GET(request: NextRequest) {
  const studyId = request.nextUrl.searchParams.get('studyId') || '';
  const signalId = request.nextUrl.searchParams.get('signalId') || '';
  const profileValue = request.nextUrl.searchParams.get('profile') || 'toxicologist';
  const profile = profiles.includes(profileValue as SemanticProfileId) ? profileValue as SemanticProfileId : 'toxicologist';
  const runtime = await loadSemanticRuntimeForProfile(profile);
  if (!runtime.capabilities.some((item) => item.id === 'retrieve-similar-findings')) {
    return NextResponse.json({ error: `Profile ${profile} cannot retrieve similar findings` }, { status: 403 });
  }
  try {
    const dataOperations: DataQueryTrace[] = [];
    const evidence = await loadPortfolioEvidence((trace) => dataOperations.push(trace));
    const selectedStudy = evidence.find((item) => item.study.id === studyId);
    const selectedSignal = selectedStudy?.signals.find((item) => item.id === signalId);
    const vectorScores = selectedSignal ? await loadPortfolioVectorScores(selectedSignal, 100, (trace) => dataOperations.push(trace)) : null;
    return NextResponse.json(comparePortfolio(evidence, studyId, signalId, 8, runtime.release.releaseId, vectorScores, dataOperations));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Similarity query failed' }, { status: 400 });
  }
}
