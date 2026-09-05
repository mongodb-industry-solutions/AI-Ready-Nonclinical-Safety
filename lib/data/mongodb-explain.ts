import type { DataQueryTrace } from '@/lib/contracts';

/** Reduce MongoDB explain output to the physical facts safe to expose in UI. */
export function summarizeMongoExplain(explanation: unknown, rowsReturned: number): DataQueryTrace['plan'] | undefined {
  if (!explanation || typeof explanation !== 'object') return undefined;
  const indexes = new Set<string>();
  const statistics: Record<string, unknown>[] = [];
  function visit(value: unknown, insideExecutedPlan = false) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, insideExecutedPlan));
    const record = value as Record<string, unknown>;
    if (record.executionStats && typeof record.executionStats === 'object') {
      statistics.push(record.executionStats as Record<string, unknown>);
      visit(record.executionStats, true);
    }
    if (insideExecutedPlan && typeof record.indexName === 'string') indexes.add(record.indexName);
    for (const [key, item] of Object.entries(record)) {
      if (key === 'executionStats' || key === 'rejectedPlans' || key === 'allPlansExecution') continue;
      visit(item, insideExecutedPlan);
    }
  }
  visit(explanation);
  const documentsExamined = statistics.reduce((total, item) => total + (typeof item.totalDocsExamined === 'number' ? item.totalDocsExamined : 0), 0);
  const keysExamined = statistics.reduce((total, item) => total + (typeof item.totalKeysExamined === 'number' ? item.totalKeysExamined : 0), 0);
  return {
    source: 'mongodb-explain-executionStats',
    indexes: [...indexes].sort(),
    ...(statistics.length ? { documentsExamined, keysExamined } : {}),
    rowsReturned,
  };
}
