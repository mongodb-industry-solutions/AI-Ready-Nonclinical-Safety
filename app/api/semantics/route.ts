import { NextResponse } from 'next/server';
import { semanticRuntimeForProfile } from '@/lib/semantics/runtime';

export async function GET(request: Request) {
  const profile = new URL(request.url).searchParams.get('profile');
  return NextResponse.json(semanticRuntimeForProfile(profile), {
    headers: { 'cache-control': 'no-store' },
  });
}
