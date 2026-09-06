import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SemanticRuntimeBundle } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';
import { loadActiveSemanticBundle } from '@/lib/semantics/repository';
import {
  materializeSemanticBundle,
  type SemanticEdgeProjection,
  type SemanticResourceProjection,
  type SemanticSearchDocument,
} from '@/lib/semantics/materialization';
import { isSemanticProfile, semanticRuntimeForProfile } from '@/lib/semantics/runtime';

const observationSchema = z.object({
  valueSetId: z.string().min(1).max(200),
  value: z.string().min(2).max(300),
  source: z.string().min(1).max(200).default('incoming SEND evidence'),
  profile: z.string().optional(),
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'contentDigest').sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function digest(bundle: SemanticRuntimeBundle): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(bundle))).digest('hex')}`;
}

export async function POST(request: Request) {
  const parsed = observationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid terminology observation' }, { status: 400 });
  const current = await loadActiveSemanticBundle();
  const valueSet = current.valueSets.find((item) => item.id === parsed.data.valueSetId);
  if (!valueSet) return NextResponse.json({ error: 'Unknown value set' }, { status: 404 });
  const profile = isSemanticProfile(parsed.data.profile) ? parsed.data.profile : 'toxicologist';
  const alreadyActive = valueSet.values.some((value) => value.toLocaleLowerCase() === parsed.data.value.toLocaleLowerCase());

  const observedAt = new Date();
  const revision = observedAt.toISOString().replace(/[-:.TZ]/g, '');
  const next = structuredClone(current);
  const nextValueSet = next.valueSets.find((item) => item.id === parsed.data.valueSetId)!;
  if (!alreadyActive) nextValueSet.values.push(parsed.data.value);
  nextValueSet.version = `${valueSet.version}+${revision}`;
  next.release = {
    ...next.release,
    version: `${current.release.version}+semantic.${revision}`,
    releaseId: `${current.release.packageId}@${current.release.version}+semantic.${revision}`,
    description: `${current.release.description} Compiled after observing ${parsed.data.value}.`,
  };
  next.contentDigest = digest(next);

  const event = {
    eventType: 'terminology.value.observed',
    ...parsed.data,
    previousReleaseId: current.release.releaseId,
    nextReleaseId: next.release.releaseId,
    status: alreadyActive ? 'already-active' : 'candidate-validated',
    observedAt,
    evidenceMutation: false,
  };
  const database = await solutionDatabase();
  if (database && !alreadyActive) {
    const materialized = materializeSemanticBundle(next);
    await database.collection('semantic_change_events').insertOne(event);
    await database.collection<SemanticResourceProjection>('semantic_resources').insertMany(materialized.resources);
    await database.collection<SemanticEdgeProjection>('semantic_edges').insertMany(materialized.edges);
    await database.collection<SemanticSearchDocument>('semantic_search_documents').insertMany(materialized.searchDocuments);
    await database.collection('semantic_releases').insertOne({ ...next.release, apiVersion: next.apiVersion, digest: next.contentDigest, bundle: next, importedAt: observedAt });
    await database.collection('semantic_runtime_pointer').replaceOne({ id: 'active' }, { id: 'active', releaseId: next.release.releaseId, digest: next.contentDigest, activatedAt: observedAt }, { upsert: true });
  }

  return NextResponse.json({
    event,
    mode: database ? 'mongodb-change-stream' : 'portable-simulation',
    runtime: semanticRuntimeForProfile(profile, alreadyActive ? current : next),
    next: ['validate candidate', 'compile value set', 'diff profile projections', 'activate release'],
  }, { status: 202 });
}
