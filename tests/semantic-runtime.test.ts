import { describe, expect, it } from 'vitest';
import { materializeSemanticBundle } from '@/lib/semantics/materialization';
import { canPerformSemanticAction, semanticRuntimeBundle, semanticRuntimeForProfile } from '@/lib/semantics/runtime';
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

  it('projects AI investigator capabilities by profile', () => {
    expect(semanticRuntimeForProfile('toxicologist').capabilities.some((item) => item.id === 'assemble-evidence-brief')).toBe(true);
    expect(semanticRuntimeForProfile('data-steward').capabilities.some((item) => item.id === 'assemble-evidence-brief')).toBe(false);
  });

  it('publishes a resumable live semantic subscription contract', () => {
    const view = semanticRuntimeForProfile('data-steward');
    expect(view.subscriptions[0].source).toBe('mongodb-change-stream');
    expect(view.subscriptions[0].events).toContain('terminology.value.observed');
    expect(view.valueSets.find((item) => item.id === 'finding-morphology')).toBeDefined();
  });

  it('combines AQL-style containment with lexical, vector, graph, fusion, and reranking stages', () => {
    const runtime = semanticRuntimeForProfile('toxicologist');
    const plan = compileLiteratureQueryPlan(runtime, 'toxicologist');
    expect(plan.profileId).toBe('toxicologist');
    expect(plan.capabilityId).toBe('retrieve-literature-evidence');
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

  it('publishes an industry-specific investigator resolver with the real API inputs', () => {
    const runtime = semanticRuntimeForProfile('toxicologist');
    const resolver = runtime.resolvers.find((item) => item.id === 'resolver.investigate-safety-signal.v1');
    expect(resolver?.input).toEqual({ studyId: 'string', snapshotId: 'string', signalId: 'string', profileId: 'string', question: 'string' });
    expect(resolver?.containmentPlan?.contains).toEqual(expect.arrayContaining(['Study', 'TreatmentGroup', 'Subject', 'Finding', 'LabMeasurement', 'SourceArtifact']));
    expect(resolver?.stages).toContain('persistAudit');
  });

  it('materializes a polymorphic semantic map and an auto-embedding source projection without vector fields', () => {
    const bundle = semanticRuntimeBundle();
    const materialized = materializeSemanticBundle(bundle);
    expect(new Set(materialized.resources.map((resource) => resource.resourceType))).toEqual(new Set([
      'object', 'profile', 'capability', 'resolver', 'action', 'surface', 'valueSet', 'concept',
      'archetype', 'storageBinding', 'sourceAdapter', 'subscription', 'queryContract', 'projectionRecipe',
    ]));
    expect(materialized.edges).toHaveLength(bundle.edges.length);
    expect(materialized.searchDocuments.length).toBeGreaterThan(materialized.resources.length + materialized.edges.length);
    expect(new Set(materialized.searchDocuments.map((document) => document._id)).size).toBe(materialized.searchDocuments.length);
    expect(materialized.searchDocuments.every((document) => document.text.length > 0 && document.profileId.length > 0)).toBe(true);
    expect(JSON.stringify(materialized.searchDocuments)).not.toMatch(/"(embedding|vector)"\s*:/i);
    expect(materialized.searchDocuments.some((document) => document.resourceId === 'Subject' && document.profileId === 'portfolio-lead')).toBe(false);
    const portfolioArchetype = materialized.searchDocuments.find((document) => document.resourceId === 'archetype.study-evidence-aggregate.v1' && document.profileId === 'portfolio-lead');
    expect(portfolioArchetype?.text).not.toContain('Subject');
    expect(portfolioArchetype?.text).not.toContain('SourceArtifact');
  });

  it('binds portable meaning to the CDISC v2 MongoDB envelope without treating projections as source authority', () => {
    const bundle = semanticRuntimeBundle();
    expect(bundle.apiVersion).toBe('contextobjects.dev/runtime-bundle/v2');
    expect(bundle.requires).toMatchObject({ dataContract: 'kehrnel.dev/cdisc-solution-evidence/v2', modelSchemaVersion: '2.0.0' });
    expect(bundle.modules.map((module) => module.packageId)).toEqual([
      'org.contextobjects.cdisc-core',
      'org.contextobjects.nonclinical-safety',
      'org.contextobjects.persistence.mongodb-cdisc',
    ]);
    const findingBinding = bundle.storageBindings.find((binding) => binding.id === 'binding.finding.cdisc');
    expect(findingBinding).toMatchObject({ location: 'cdisc_records', path: 'canonical.data', authority: 'canonical' });
    expect(findingBinding?.selector).toMatchObject({ 'canonical.domain': 'MI' });
    expect(bundle.queryContracts.map((contract) => contract.queryClass)).toEqual(['operational', 'semantic', 'research']);
  });
});
