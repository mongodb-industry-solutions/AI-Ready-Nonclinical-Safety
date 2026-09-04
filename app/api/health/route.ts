import { NextResponse } from 'next/server';
import { configuredForMongoDB } from '@/lib/data/mongodb';
import { configuredForReviewStore } from '@/lib/data/review-store';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'ai-ready-nonclinical-safety',
    version: '0.1.0',
    dataMode: configuredForMongoDB() ? 'mongodb' : 'fixture',
    agentMode: process.env.INTERNAL_AGENT_URL ? 'magenta' : 'deterministic',
    reviewStore: configuredForReviewStore() ? 'mongodb' : 'ephemeral',
  });
}
