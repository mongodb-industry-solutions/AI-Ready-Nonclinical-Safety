import { describe, expect, it } from 'vitest';
import { investigate } from '@/lib/ai/investigator';
import type { CanonicalEvidenceRecord, SignalRecordEvidence } from '@/lib/contracts';
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
});
