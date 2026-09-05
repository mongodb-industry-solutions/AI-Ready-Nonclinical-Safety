import { describe, expect, it } from 'vitest';
import { investigate } from '@/lib/ai/investigator';
import type { CanonicalEvidenceRecord, SemanticGroundingResult, SignalRecordEvidence } from '@/lib/contracts';
import { demoEvidence } from '@/lib/data/demo';

function record(domain: string, sourceId: string): CanonicalEvidenceRecord {
  return {
    sourceId,
    domain,
    rowOrdinal: 1,
    recordKey: {},
    facets: {},
    data: {},
    lineage: { sourceDataset: domain, sourceRow: 1, recordHash: `sha256:${sourceId}` },
  };
}

describe('AI safety investigator provenance', () => {
  it('cites hydrated canonical records instead of aggregate aliases', async () => {
    const records: SignalRecordEvidence = {
      available: true,
      studyId: demoEvidence.study.id,
      snapshotId: demoEvidence.study.snapshotId,
      signalId: demoEvidence.signals[0].id,
      packageId: 'sha256:package',
      subjects: [{
        subjectId: 'S-1',
        domainCounts: { MI: 1, LB: 1 },
        findingRecords: [record('MI', 'mi-row-1')],
        laboratoryRecords: [record('LB', 'lb-row-1')],
      }],
      treatmentRecords: [record('TX', 'tx-row-1')],
      sourceArtifacts: [],
      domainInventory: [
        { domain: 'MI', studyRecords: 1 },
        { domain: 'LB', studyRecords: 1 },
        { domain: 'TX', studyRecords: 1 },
      ],
      counts: { findings: 1, laboratory: 1, subjects: 1, artifacts: 0 },
    };
    const result = await investigate(demoEvidence, demoEvidence.signals[0].id, 'What supports this finding?', 'toxicologist', records);
    expect(result.citations.map((citation) => citation.sourceRef)).toEqual(['mi-row-1', 'lb-row-1', 'tx-row-1']);
    expect(result.citations[0].detail).toContain('sha256:mi-row-1');
  });

  it('returns a server-composed canvas and records hybrid semantic grounding', async () => {
    const grounding: SemanticGroundingResult = {
      query: 'thymus lymphocyte depletion',
      mode: 'atlas-hybrid',
      releaseId: 'org.contextobjects.nonclinical-safety@0.4.1',
      profileId: 'toxicologist',
      hits: [{ resourceType: 'concept', resourceId: 'lymphocyte-depletion', label: 'Lymphocyte depletion', excerpt: 'Governed morphology', score: 100, lanes: ['lexical', 'vector'], sourceRef: 'semantic:lymphocyte-depletion' }],
      stages: [
        { id: 'lexical', status: 'executed', detail: 'Atlas Search' },
        { id: 'vector', status: 'executed', detail: 'Atlas Automated Embedding' },
        { id: 'fuse', status: 'executed', detail: 'Reciprocal-rank fusion' },
      ],
      managedEmbedding: { index: 'semantic_map_auto_embed', sourcePath: 'text', vectorStorage: '__mdb_internal_search', vectorFieldInSourceDocument: false },
    };

    const result = await investigate(demoEvidence, demoEvidence.signals[0].id, 'What supports this finding?', 'toxicologist', undefined, undefined, grounding);

    expect(result.widgets.map((widget) => widget.kind)).toEqual(['dose-response', 'laboratory-trajectory', 'semantic-grounding', 'execution-plan', 'evidence-topology']);
    expect(result.steps.find((step) => step.id === 'retrieve')).toMatchObject({ status: 'complete' });
    expect(result.semanticGrounding?.managedEmbedding.vectorFieldInSourceDocument).toBe(false);
    expect(result.citations).toEqual(expect.arrayContaining([expect.objectContaining({ domain: 'SEMANTIC', sourceRef: 'semantic:lymphocyte-depletion' })]));
  });
});
