import { NextResponse } from 'next/server';
import { loadBiologicalCoherence } from '@/lib/data/coherence-repository';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import { isSemanticProfile, semanticRuntimeForProfile } from '@/lib/semantics/runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ studyId: string; signalId: string }> }) {
  const { studyId: encodedStudyId, signalId: encodedSignalId } = await context.params;
  const studyId = decodeURIComponent(encodedStudyId);
  const signalId = decodeURIComponent(encodedSignalId);
  const requestedProfile = new URL(request.url).searchParams.get('profile');
  if (!isSemanticProfile(requestedProfile || 'toxicologist')) {
    return NextResponse.json({ error: 'Unknown semantic profile' }, { status: 400 });
  }
  try {
    const [evidence, bundle] = await Promise.all([loadStudyEvidence(studyId), loadActiveSemanticBundle()]);
    const signal = evidence.signals.find((item) => item.id === signalId);
    if (!signal) return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    const runtime = semanticRuntimeForProfile(requestedProfile || 'toxicologist', bundle);
    if (!runtime.capabilities.some((item) => item.id === 'resolve-biological-coherence')) {
      return NextResponse.json({ error: 'This profile is not authorized to resolve biological coherence' }, { status: 403 });
    }
    const resolver = runtime.resolvers.find((item) => item.id === 'resolver.biological-coherence.v1');
    if (!resolver) return NextResponse.json({ error: 'The active semantic release does not compile the biological-coherence resolver' }, { status: 503 });
    const result = await loadBiologicalCoherence(evidence.study.id, evidence.study.snapshotId, signal, runtime.release.releaseId, resolver);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof StudyEvidenceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Biological coherence could not be resolved' }, { status: 500 });
  }
}
