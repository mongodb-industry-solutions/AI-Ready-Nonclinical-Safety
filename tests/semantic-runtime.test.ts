import { describe, expect, it } from 'vitest';
import { canPerformSemanticAction, semanticRuntimeForProfile } from '@/lib/semantics/runtime';
import { compileLiteratureQueryPlan } from '@/lib/semantics/query-planner';

describe('portable semantic runtime', () => {
  it('removes subject-level objects from the portfolio projection', () => {
    const view = semanticRuntimeForProfile('portfolio-lead');
    expect(view.objects.some((object) => object.id === 'Subject')).toBe(false);
    expect(view.edges.every((edge) => view.objects.some((object) => object.id === edge.from) && view.objects.some((object) => object.id === edge.to))).toBe(true);
  });

  it('enforces governed action grants independently of the UI', () => {
    expect(canPerformSemanticAction('study-director', 'approve')).toBe(true);
    expect(canPerformSemanticAction('toxicologist', 'approve')).toBe(false);
    expect(canPerformSemanticAction('external-reviewer', 'annotate')).toBe(false);
  });

  it('publishes a resumable live semantic subscription contract', () => {
    const view = semanticRuntimeForProfile('data-steward');
    expect(view.subscriptions[0].source).toBe('mongodb-change-stream');
    expect(view.subscriptions[0].events).toContain('terminology.value.observed');
    expect(view.valueSets.find((item) => item.id === 'finding-morphology')).toBeDefined();
  });

  it('combines AQL-style containment with lexical, vector, graph, fusion, and reranking stages', () => {
    const runtime = semanticRuntimeForProfile('toxicologist');
    const plan = compileLiteratureQueryPlan(runtime);
    expect(plan.semanticScope.semantics).toBe('AQL-CONTAINS');
    expect(plan.semanticScope.contains).toContain('Finding');
    expect(plan.stages.map((stage) => stage.engine)).toEqual(expect.arrayContaining([
      'mongodb-aggregation',
      'atlas-search',
      'atlas-vector-search',
      'mongodb-graph-lookup',
      'reciprocal-rank-fusion',
      'domain-reranker',
    ]));
  });
});
