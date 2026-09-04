import { describe, expect, it } from 'vitest';
import { demoEvidence } from '@/lib/data/demo';
import { reviewScore, signalSummary, treatedIncidence } from '@/lib/analysis/signal-engine';

describe('safety signal engine', () => {
  const signal = demoEvidence.signals[0];

  it('preserves the observed thymus incidence by ascending dose', () => {
    expect(treatedIncidence(signal, demoEvidence.doseGroups).pairs).toEqual([
      { dose: 0, affected: 0, total: 2 },
      { dose: 4, affected: 1, total: 2 },
      { dose: 6, affected: 2, total: 2 },
      { dose: 8, affected: 2, total: 2 },
      { dose: 12, affected: 2, total: 2 },
    ]);
  });

  it('ranks a treated-only signal without claiming causality', () => {
    expect(reviewScore(signal, demoEvidence.doseGroups)).toBeGreaterThan(70);
    expect(signalSummary(signal, demoEvidence.doseGroups)).toContain('absent in controls');
  });
});
