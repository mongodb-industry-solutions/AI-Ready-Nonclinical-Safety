import { NextResponse } from 'next/server';
import { loadSemanticRuntimeForProfile } from '@/lib/semantics/repository';

export async function GET(request: Request) {
  const profile = new URL(request.url).searchParams.get('profile');
  return NextResponse.json(await loadSemanticRuntimeForProfile(profile), {
    headers: { 'cache-control': 'no-store' },
  });
}
