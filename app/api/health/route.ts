import { NextResponse } from 'next/server';
import { configuredForMongoDB, solutionDatabase } from '@/lib/data/mongodb';
import { configuredForReviewStore } from '@/lib/data/review-store';
import { agentHealth } from '@/lib/ai/agent-health';
import { semanticRuntimeBundle } from '@/lib/semantics/runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Both dependencies are probed, not inferred from configuration, so this
  // endpoint can be trusted as a readiness check.
  const [agent, database] = await Promise.all([agentHealth(true), solutionDatabase()]);
  const runtime = semanticRuntimeBundle();
  return NextResponse.json({
    ok: true,
    service: 'ai-ready-nonclinical-safety',
    version: '1.0.0',
    dataMode: database ? 'mongodb' : configuredForMongoDB() ? 'mongodb-unreachable' : 'fixture',
    agentMode: agent.status === 'ready' ? 'magenta' : 'deterministic',
    agent,
    reviewStore: configuredForReviewStore() ? 'mongodb' : 'ephemeral',
    contracts: {
      cdiscDataContract: runtime.requires.dataContract,
      modelSchemaVersion: runtime.requires.modelSchemaVersion,
      semanticRelease: runtime.release.releaseId,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
