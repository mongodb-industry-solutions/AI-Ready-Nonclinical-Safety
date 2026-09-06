import { describe, expect, it } from 'vitest';
import { summarizeMongoExplain } from '@/lib/data/mongodb-explain';

describe('MongoDB physical-plan telemetry', () => {
  it('reports only indexes from the executed plan, not rejected candidates', () => {
    const plan = summarizeMongoExplain({
      queryPlanner: { rejectedPlans: [{ stage: 'IXSCAN', indexName: 'rejected_index' }] },
      executionStats: {
        nReturned: 3,
        totalDocsExamined: 3,
        totalKeysExamined: 4,
        executionStages: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'winning_index' } },
      },
    }, 3);

    expect(plan).toEqual({
      source: 'mongodb-explain-executionStats',
      indexes: ['winning_index'],
      documentsExamined: 3,
      keysExamined: 4,
      rowsReturned: 3,
    });
  });
});
