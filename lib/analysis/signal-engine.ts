import type { DoseGroup, SafetySignal } from '@/lib/contracts';

export function treatedIncidence(signal: SafetySignal, groups: DoseGroup[]) {
  const pairs = groups.map((group, index) => ({
    dose: group.dose,
    affected: signal.incidence[index] ?? 0,
    total: group.animalCount,
  }));
  const control = pairs.find((row) => row.dose === 0);
  const treated = pairs.filter((row) => row.dose > 0);
  return {
    pairs,
    controlRate: control ? control.affected / control.total : 0,
    treatedRate: treated.reduce((sum, row) => sum + row.affected, 0) /
      Math.max(1, treated.reduce((sum, row) => sum + row.total, 0)),
  };
}

export function reviewScore(signal: SafetySignal, groups: DoseGroup[]): number {
  const incidence = treatedIncidence(signal, groups);
  const treatedOnly = incidence.controlRate === 0 && incidence.treatedRate > 0;
  const severityWeight = (signal.severity.moderate || 0) * 8 + (signal.severity.mild || 0) * 3;
  return Math.min(100, Math.round(incidence.treatedRate * 65 + severityWeight + (treatedOnly ? 15 : 0)));
}

export function signalSummary(signal: SafetySignal, groups: DoseGroup[]): string {
  const { pairs, controlRate, treatedRate } = treatedIncidence(signal, groups);
  const distribution = pairs.map((row) => `${row.dose} mg/kg: ${row.affected}/${row.total}`).join(', ');
  if (controlRate === 0 && treatedRate >= 0.5) {
    return `${signal.finding} is absent in controls and occurs in ${Math.round(treatedRate * 100)}% of treated animals (${distribution}).`;
  }
  return `${signal.finding} occurs across the following groups: ${distribution}. The pattern requires contextual review.`;
}
