import { solutionDatabase } from '@/lib/data/mongodb';
import { isSemanticProfile, semanticRuntimeBundle } from '@/lib/semantics/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();

function event(name: string, data: unknown, id?: string): Uint8Array {
  return encoder.encode(`${id ? `id: ${id}\n` : ''}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('profile');
  const profile = isSemanticProfile(requested) ? requested : 'toxicologist';
  const bundle = semanticRuntimeBundle();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(event('semantic.snapshot.ready', {
        releaseId: bundle.release.releaseId,
        profile,
        source: process.env.MONGODB_URI ? 'mongodb-change-stream' : 'portable-bundle',
      }));

      const heartbeat = setInterval(() => {
        try { controller.enqueue(event('heartbeat', { releaseId: bundle.release.releaseId, at: new Date().toISOString() })); } catch { /* client disconnected */ }
      }, 15_000);

      let changeStream: Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof solutionDatabase>>>['watch']>> | null = null;
      cleanup = () => {
        clearInterval(heartbeat);
        void changeStream?.close();
      };
      request.signal.addEventListener('abort', cleanup, { once: true });

      try {
        const database = await solutionDatabase();
        if (!database) return;
        changeStream = database.watch([
          { $match: { 'ns.coll': { $in: ['semantic_releases', 'semantic_objects', 'semantic_profiles', 'semantic_value_sets', 'semantic_change_events', 'review_actions'] } } },
        ], { fullDocument: 'updateLookup' });
        changeStream.on('change', (change) => {
          const collection = change.ns?.coll || 'unknown';
          const eventName = collection === 'review_actions' ? 'review.action.committed' : collection === 'semantic_change_events' ? 'terminology.value.observed' : collection === 'semantic_value_sets' ? 'terminology.valueset.compiled' : collection === 'semantic_profiles' ? 'profile.projection.changed' : collection === 'semantic_objects' ? 'semantic.object.changed' : 'semantic.release.activated';
          controller.enqueue(event(eventName, {
            operation: change.operationType,
            collection,
            profile,
            releaseId: bundle.release.releaseId,
          }, change._id?._data));
        });
        changeStream.on('error', () => controller.enqueue(event('semantic.stream.degraded', { fallback: 'snapshot', releaseId: bundle.release.releaseId })));
      } catch {
        controller.enqueue(event('semantic.stream.degraded', { fallback: 'portable-bundle', releaseId: bundle.release.releaseId }));
      }
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
