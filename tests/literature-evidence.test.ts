import { describe, expect, it } from 'vitest';
import { allLiterature, literatureSource, relatedLiterature } from '@/lib/data/literature-repository';
import { rankLiterature, reciprocalRankFusion } from '@/lib/data/literature-query';

describe('external literature evidence', () => {
  it('links curated PubMed evidence to a study signal without claiming causality', () => {
    const documents = relatedLiterature('thymus-lymphocytes');
    expect(documents).toHaveLength(3);
    expect(documents.map((document) => document.evidenceRole)).toEqual([
      'pathology-reference',
      'analogous-pattern',
      'alternative-explanation',
    ]);
    expect(documents.every((document) => document.relevance.length > 40)).toBe(true);
  });

  it('keeps bibliographic identity and licensing boundaries explicit', () => {
    const source = literatureSource();
    expect(source.fullTextPolicy).toMatch(/open-access|licensed/i);
    for (const document of allLiterature()) {
      expect(document.pmid).toMatch(/^\d+$/);
      expect(document.doi).toBeTruthy();
      expect(document.url).toBe(`https://pubmed.ncbi.nlm.nih.gov/${document.pmid}/`);
      expect(document).not.toHaveProperty('fullText');
    }
  });

  it('fuses independent retrieval lanes and exposes their provenance', () => {
    const fused = reciprocalRankFusion([
      [{ publicationId: 'pmid-17067942' }, { publicationId: 'pmid-10401683' }],
      [{ publicationId: 'pmid-10401683' }, { publicationId: 'pmid-8378702' }],
    ]);
    expect(fused.get('pmid-10401683')).toBeGreaterThan(fused.get('pmid-17067942') || 0);

    const ranked = rankLiterature(
      allLiterature(),
      [
        { lane: 'containment', candidates: allLiterature().map((document) => ({ publicationId: document.id })) },
        { lane: 'lexical', candidates: [{ publicationId: 'pmid-17067942' }] },
        { lane: 'graph', candidates: [{ publicationId: 'pmid-17067942' }] },
      ],
      'thymus cortical lymphocyte depletion',
      'mongodb',
    );
    expect(ranked[0].id).toBe('pmid-17067942');
    expect(ranked[0].retrieval.lanes).toEqual(['containment', 'lexical', 'graph']);
  });
});
