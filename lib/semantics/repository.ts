import type { SemanticRuntimeBundle, SemanticRuntimeView } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';
import { semanticRuntimeBundle, semanticRuntimeForProfile } from '@/lib/semantics/runtime';

type StoredSemanticRelease = {
  releaseId: string;
  active: boolean;
  bundle?: SemanticRuntimeBundle;
};

export async function loadActiveSemanticBundle(): Promise<SemanticRuntimeBundle> {
  const database = await solutionDatabase();
  if (!database) return semanticRuntimeBundle();

  const pointer = await database.collection<{ id: string; releaseId: string }>('semantic_runtime_pointer').findOne({ id: 'active' });
  const query = pointer?.releaseId ? { releaseId: pointer.releaseId } : { active: true };
  const release = await database.collection<StoredSemanticRelease>('semantic_releases').findOne(query);
  return release?.bundle || semanticRuntimeBundle();
}

export async function loadSemanticRuntimeForProfile(profile?: string | null): Promise<SemanticRuntimeView> {
  return semanticRuntimeForProfile(profile, await loadActiveSemanticBundle());
}
