import { describe, expect, it } from 'vitest';
import { allLiterature, literatureSource, relatedLiterature } from '@/lib/data/literature-repository';

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
});
