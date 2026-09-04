import { NextResponse } from 'next/server';
import { configuredForKehrnel } from '@/lib/data/kehrnel';
import { configuredForReviewStore } from '@/lib/data/review-store';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'ai-ready-nonclinical-safety',
    version: '0.1.0',
    dataMode: configuredForKehrnel() ? 'kehrnel' : 'fixture',
    agentMode: process.env.MAGENTA_AGENT_URL ? 'magenta' : 'deterministic',
    reviewStore: configuredForReviewStore() ? 'mongodb' : 'ephemeral',
  });
}
