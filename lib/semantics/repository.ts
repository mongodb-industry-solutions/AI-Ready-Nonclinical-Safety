import type { SemanticRuntimeBundle, SemanticRuntimeView } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';
import { semanticRuntimeBundle, semanticRuntimeForProfile } from '@/lib/semantics/runtime';

type StoredSemanticRelease = {
  releaseId: string;
  bundle?: SemanticRuntimeBundle;
  importedAt?: Date;
};

export async function loadActiveSemanticBundle(): Promise<SemanticRuntimeBundle> {
  const database = await solutionDatabase();
  if (!database) return semanticRuntimeBundle();

  const pointer = await database.collection<{ id: string; releaseId: string }>('semantic_runtime_pointer').findOne({ id: 'active' });
  const releases = database.collection<StoredSemanticRelease>('semantic_releases');
  const release = pointer?.releaseId
    ? await releases.findOne({ releaseId: pointer.releaseId })
    : await releases.find({ bundle: { $exists: true } }).sort({ importedAt: -1 }).limit(1).next();
  return release?.bundle || semanticRuntimeBundle();
}

export async function loadSemanticRuntimeForProfile(profile?: string | null): Promise<SemanticRuntimeView> {
  return semanticRuntimeForProfile(profile, await loadActiveSemanticBundle());
}
