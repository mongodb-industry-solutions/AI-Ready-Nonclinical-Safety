import { describe, expect, it } from 'vitest';
import { projectStudyEvidence, STUDY_EVIDENCE_PROJECTION_VERSION } from '../scripts/lib/study-evidence-projector.mjs';

const record = (domain, sourceId, data, facets = {}) => ({
  domain,
  sourceId,
  data,
  facets,
  lineage: { recordHash: `sha256:${sourceId}`, sourceDataset: domain, sourceRow: 1 },
});

const records = [
  record('DM', 'dm-control', { USUBJID: 'S-1', SETCD: 'C' }, { subjectId: 'S-1', treatmentGroup: 'C' }),
  record('DM', 'dm-dose', { USUBJID: 'S-2', SETCD: 'D' }, { subjectId: 'S-2', treatmentGroup: 'D' }),
  record('TX', 'tx-dose', { SETCD: 'D', TXPARMCD: 'TRTDOS', TXVAL: '8' }, { treatmentGroup: 'D' }),
  record('TX', 'tx-dose-unit', { SETCD: 'D', TXPARMCD: 'TRTDOSU', TXVAL: 'mg/kg' }, { treatmentGroup: 'D' }),
  record('TX', 'tx-control', { SETCD: 'C', TXPARMCD: 'TRTDOS', TXVAL: '0' }, { treatmentGroup: 'C' }),
  record('TX', 'tx-control-unit', { SETCD: 'C', TXPARMCD: 'TRTDOSU', TXVAL: 'mg/kg' }, { treatmentGroup: 'C' }),
  record('MI', 'mi-thymus', { USUBJID: 'S-2', MISPEC: 'THYMUS', MISTRESC: 'Decreased number, lymphocytes, cortex', MISEV: 'MILD' }, { subjectId: 'S-2', organ: 'THYMUS', finding: 'Decreased number, lymphocytes, cortex' }),
  record('LB', 'lb-control', { USUBJID: 'S-1', LBTESTCD: 'LYM', LBTEST: 'Lymphocytes', LBDY: 29, LBSTRESN: 7, LBSTRESU: '10^9/L' }, { subjectId: 'S-1', testCode: 'LYM', test: 'Lymphocytes', studyDay: 29, resultNumeric: 7, resultUnit: '10^9/L' }),
  record('LB', 'lb-dose', { USUBJID: 'S-2', LBTESTCD: 'LYM', LBTEST: 'Lymphocytes', LBDY: 29, LBSTRESN: 3, LBSTRESU: '10^9/L' }, { subjectId: 'S-2', testCode: 'LYM', test: 'Lymphocytes', studyDay: 29, resultNumeric: 3, resultUnit: '10^9/L' }),
];

const packageDocument = {
  modelSchemaVersion: '1.0.0',
  manifest: {
    studyId: 'TEST-1',
    snapshotId: 'published-v1',
    packageId: 'sha256:package',
    standardsPackageId: 'test-send',
    profile: 'send',
    publicationState: 'published',
    contentDigest: { algorithm: 'sha256', value: 'package' },
    counts: { records: records.length },
  },
  evidence: {
    snapshot: { publishedAt: '2026-09-05T00:00:00Z' },
    records,
    datasets: ['DM', 'TX', 'MI', 'LB'].map((domain) => ({
      domain,
      recordCount: records.filter((item) => item.domain === domain).length,
      standard: { family: 'SEND', implementationGuide: 'SENDIG', implementationGuideVersion: '3.1.1' },
    })),
    sourceArtifacts: [{
      sourceName: 'study.xpt',
      digest: { algorithm: 'sha256', value: 'artifact' },
      metadata: { sourceRepository: 'https://example.test/send', sourceRevision: 'abc123' },
    }],
  },
};

describe('canonical SEND study evidence projector', () => {
  it('derives dose, signal, lab, and record lineage from one package', () => {
    const projection = projectStudyEvidence(packageDocument);
    expect(projection.doseGroups.map((group) => group.dose)).toEqual([0, 8]);
    expect(projection.signals).toHaveLength(1);
    expect(projection.signals[0]).toMatchObject({
      id: 'thymus-lymphocytes',
      incidence: [0, 1],
      affectedAnimals: 1,
      severity: { mild: 1 },
      sourceRecordIds: ['mi-thymus'],
    });
    expect(projection.labSeries.LYM.points).toEqual([{ day: 29, 0: 7, 8: 3 }]);
    expect(projection.provenance.projectionVersion).toBe(STUDY_EVIDENCE_PROJECTION_VERSION);
    expect(projection.provenance.reconciliation.status).toBe('reconciled');
    expect(projection.provenance.reconciliation.checks).toEqual({
      domainCountsMatch: true,
      recordCountMatches: true,
      subjectCountMatches: true,
    });
  });

  it('produces the same projection digest for the same immutable package', () => {
    expect(projectStudyEvidence(packageDocument).provenance.projectionDigest)
      .toEqual(projectStudyEvidence(packageDocument).provenance.projectionDigest);
  });
});
