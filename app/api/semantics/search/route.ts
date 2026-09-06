import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import { isSemanticProfile } from '@/lib/semantics/runtime';
import { searchSemanticMap } from '@/lib/semantics/search';

const querySchema = z.object({
  q: z.string().trim().min(2).max(500),
  profile: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q'),
    profile: url.searchParams.get('profile') || undefined,
    limit: url.searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid semantic search request' }, { status: 400 });

  const bundle = await loadActiveSemanticBundle();
  const profileId = isSemanticProfile(parsed.data.profile) ? parsed.data.profile : 'toxicologist';
  const capability = bundle.capabilities.find((item) => item.id === 'inspect-semantic-model');
  if (!capability?.allowedProfiles.includes(profileId)) return NextResponse.json({ error: 'Profile is not authorized to inspect the semantic map' }, { status: 403 });

  return NextResponse.json({
    releaseId: bundle.release.releaseId,
    profileId,
    ...await searchSemanticMap({ bundle, profileId, query: parsed.data.q, limit: parsed.data.limit }),
  }, { headers: { 'cache-control': 'no-store' } });
}
