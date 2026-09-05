import type { SafetySignal } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';

type PortfolioVectorHit = {
  studyId: string;
  snapshotId: string;
  signalId: string;
  score: number;
};

export function portfolioSignalText(signal: SafetySignal): string {
  return `${signal.organ}. ${signal.finding}. ${signal.pattern}. ${signal.correlatedLab ? `Correlated laboratory test ${signal.correlatedLab}.` : ''}`.trim();
}

export async function loadPortfolioVectorScores(
  signal: SafetySignal,
  limit = 100,
): Promise<ReadonlyMap<string, number> | null> {
  const database = await solutionDatabase().catch(() => null);
  if (!database) return null;

  try {
    const hits = await database.collection('portfolio_findings').aggregate<PortfolioVectorHit>([
      {
        $vectorSearch: {
          index: process.env.ATLAS_PORTFOLIO_AUTO_EMBED_INDEX || 'safety_portfolio_auto_embed',
          path: 'text',
          query: portfolioSignalText(signal),
          numCandidates: Math.max(100, limit * 5),
          limit: Math.max(1, Math.min(limit, 200)),
        },
      },
      {
        $project: {
          _id: 0,
          studyId: 1,
          snapshotId: 1,
          signalId: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]).toArray();
    return new Map(hits.map((hit) => [
      `${hit.studyId}:${hit.snapshotId}:${hit.signalId}`,
      hit.score,
    ]));
  } catch {
    return null;
  }
}
