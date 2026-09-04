import { NextResponse } from 'next/server';
import { z } from 'zod';
import { solutionDatabase } from '@/lib/data/mongodb';
import { semanticRuntimeBundle } from '@/lib/semantics/runtime';

const observationSchema = z.object({
  valueSetId: z.string().min(1).max(200),
  value: z.string().min(2).max(300),
  source: z.string().min(1).max(200).default('incoming SEND evidence'),
});

export async function POST(request: Request) {
  const parsed = observationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid terminology observation' }, { status: 400 });
  const valueSet = semanticRuntimeBundle().valueSets.find((item) => item.id === parsed.data.valueSetId);
  if (!valueSet) return NextResponse.json({ error: 'Unknown value set' }, { status: 404 });

  const event = {
    eventType: 'terminology.value.observed',
    ...parsed.data,
    previousVersion: valueSet.version,
    status: 'candidate',
    observedAt: new Date().toISOString(),
    evidenceMutation: false,
  };
  const database = await solutionDatabase();
  if (database) {
    const collection = database.collection('semantic_change_events');
    await collection.createIndex({ valueSetId: 1, observedAt: -1 }, { name: 'value_set_observations' });
    await collection.insertOne(event);
  }
  return NextResponse.json({
    event,
    mode: database ? 'mongodb-change-stream' : 'portable-simulation',
    next: ['validate candidate', 'compile value set', 'diff profile projections', 'activate release'],
  }, { status: 202 });
}
