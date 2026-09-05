import { describe, expect, it } from 'vitest';
import { comparePortfolio } from '@/lib/analysis/portfolio-similarity';
import { demoEvidence } from '@/lib/data/demo';
import { portfolioBenchmarks } from '@/lib/data/portfolio-benchmarks';

describe('portfolio similarity resolver', () => {
  it('ranks same-organ benchmark findings and keeps evidence classes explicit', () => {
    const observed = { ...demoEvidence, study: { ...demoEvidence.study, evidenceClass: 'observed-public' as const } };
    const result = comparePortfolio([observed, ...portfolioBenchmarks], observed.study.id, 'thymus-lymphocytes');

    expect(result.corpus).toMatchObject({ studies: 4, observedStudies: 1, syntheticStudies: 3 });
    expect(result.matches[0].signal.organ).toBe('THYMUS');
    expect(result.matches[0].evidenceClass).toBe('synthetic-benchmark');
    expect(result.matches[0].lanes.find((lane) => lane.id === 'semantic')?.score).toBe(100);
    expect(result.execution.vectorLane).toBe('skipped-no-vector-candidates');
    expect(result.execution.boundary).toContain('never become observed');
  });

  it('executes the vector lane when Atlas Automated Embedding returns candidate scores', () => {
    const observed = structuredClone(demoEvidence);
    const benchmark = structuredClone(portfolioBenchmarks[0]);
    const candidateId = `${benchmark.study.id}:${benchmark.study.snapshotId}:${benchmark.signals[0].id}`;

    const result = comparePortfolio(
      [observed, benchmark],
      observed.study.id,
      observed.signals[0].id,
      8,
      'org.contextobjects.nonclinical-safety@0.2.0',
      new Map([[candidateId, 0.91]]),
    );
    expect(result.execution.vectorLane).toBe('executed');
    expect(result.matches.find((item) => item.signal.id === benchmark.signals[0].id)?.lanes.at(-1)?.status).toBe('executed');
  });
});
