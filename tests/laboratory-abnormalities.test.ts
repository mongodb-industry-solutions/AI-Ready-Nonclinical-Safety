import { describe, expect, it } from 'vitest';
import { summarizeLaboratoryAbnormalities } from '@/lib/data/coherence-repository';

describe('laboratory abnormality projection', () => {
  it('groups source-defined outliers and keeps selected-signal overlap distinct', () => {
    const result = summarizeLaboratoryAbnormalities([
      { sourceId: 'alb-low', facets: { subjectId: 'A-1', testCode: 'ALB' }, data: { LBTEST: 'Albumin', LBSTRESN: 2.1, LBSTNRLO: 2.5, LBSTNRHI: 4.0, LBSTRESU: 'g/dL' } },
      { sourceId: 'alb-high', facets: { subjectId: 'A-2', testCode: 'ALB' }, data: { LBTEST: 'Albumin', LBSTRESN: 4.2, LBSTNRLO: 2.5, LBSTNRHI: 4.0, LBSTRESU: 'g/dL' } },
      { sourceId: 'potassium-flag', facets: { subjectId: 'A-1', testCode: 'K' }, data: { LBTEST: 'Potassium', LBSTRESN: 7.2, LBNRIND: 'HIGH', LBSTRESU: 'mmol/L' } },
    ], ['A-1']);

    expect(result.selectedSignalSubjectCount).toBe(1);
    expect(result.summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ testCode: 'ALB', outsideRangeResults: 2, subjectCount: 2, signalSubjectCount: 1, directionCounts: { low: 1, high: 1, sourceFlagged: 0 } }),
      expect.objectContaining({ testCode: 'K', outsideRangeResults: 1, signalSubjectCount: 1, directionCounts: { low: 0, high: 1, sourceFlagged: 0 } }),
    ]));
  });

  it('does not infer an abnormality when the source supplies neither a flag nor limits', () => {
    const result = summarizeLaboratoryAbnormalities([], ['A-1']);
    expect(result).toEqual({ summaries: [], selectedSignalSubjectCount: 0 });
  });
});
