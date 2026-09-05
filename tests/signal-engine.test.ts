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

  it('summarizes technical treatment groups as biological dose levels', () => {
    const groups = [
      { code: 'C-M', label: 'Control male', dose: 0, unit: 'mg/kg', animalCount: 10 },
      { code: 'C-F', label: 'Control female', dose: 0, unit: 'mg/kg', animalCount: 10 },
      { code: 'H-M', label: 'High male', dose: 200, unit: 'mg/kg', animalCount: 10 },
      { code: 'H-F', label: 'High female', dose: 200, unit: 'mg/kg', animalCount: 10 },
    ];
    const repeatedGroupSignal = { ...signal, incidence: [0, 0, 5, 7] };

    expect(treatedIncidence(repeatedGroupSignal, groups).pairs).toEqual([
      { dose: 0, affected: 0, total: 20 },
      { dose: 200, affected: 12, total: 20 },
    ]);
    expect(signalSummary(repeatedGroupSignal, groups)).toContain('0 mg/kg: 0/20, 200 mg/kg: 12/20');
  });
});
