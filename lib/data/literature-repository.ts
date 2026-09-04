import literature from '@/data/literature-evidence.json';
import type { LiteratureDocument, LiteratureEvidence } from '@/lib/contracts';

const source = literature as LiteratureEvidence;

export function relatedLiterature(signalId: string): LiteratureDocument[] {
  return source.documents.filter((document) => document.matchedSignalIds.includes(signalId));
}

export function literatureSource(): LiteratureEvidence['source'] {
  return source.source;
}

export function allLiterature(): LiteratureDocument[] {
  return source.documents;
}
