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

  it('accepts the SEND field conventions emitted by the Kehrnel safety-signal generator', () => {
    const syntheticRecords = records.map((item) => structuredClone(item));
    for (const item of syntheticRecords) {
      if (item.domain === 'DM') {
        item.data.SPGRPCD = item.data.SETCD;
        delete item.data.SETCD;
        delete item.facets.treatmentGroup;
      }
      if (item.domain === 'TX' && item.data.TXPARMCD === 'TRTDOS') {
        item.data.TXVALN = Number(item.data.TXVAL);
        item.data.TXVALU = 'mg/kg/day';
        item.data.TXVAL = item.data.TXVALN === 0 ? 'Vehicle control' : 'High dose';
      }
      if (item.domain === 'TX' && item.data.TXPARMCD === 'TRTDOSU') item.data.TXVAL = '';
      if (item.domain === 'MI') {
        item.data.MISTRESC = 'DECREASED LYMPHOCYTES, CORTEX';
        item.facets.finding = '';
      }
    }
    const syntheticPackage = structuredClone(packageDocument);
    syntheticPackage.manifest.studyId = 'SYNTH-TEST';
    syntheticPackage.manifest.standardsPackageId = 'sendig-3.0';
    syntheticPackage.evidence.records = syntheticRecords;

    const projection = projectStudyEvidence(syntheticPackage);
    expect(projection.doseGroups).toMatchObject([
      { code: 'C', dose: 0, unit: 'mg/kg/day' },
      { code: 'D', dose: 8, unit: 'mg/kg/day' },
    ]);
    expect(projection.signals[0]).toMatchObject({ id: 'thymus-lymphocytes', incidence: [0, 1] });
    expect(projection.study.evidenceClass).toBe('sponsor-observed');
  });

  it('derives bounded review signals and TS metadata for an independent public SEND package', () => {
    const publicRecords = records.map((item) => structuredClone(item));
    publicRecords.push(
      record('MI', 'mi-kidney', { USUBJID: 'S-2', MISPEC: 'KIDNEY', MISTRESC: 'Tubular degeneration', MISEV: 'MODERATE' }, { subjectId: 'S-2', organ: 'KIDNEY', finding: 'Tubular degeneration' }),
      record('MI', 'mi-normal', { USUBJID: 'S-1', MISPEC: 'KIDNEY', MISTRESC: 'NORMAL' }, { subjectId: 'S-1', organ: 'KIDNEY', finding: 'NORMAL' }),
      record('MI', 'mi-procedure', { USUBJID: 'S-1', MISPEC: 'KIDNEY', MISTRESC: 'Microscopic Examination' }, { subjectId: 'S-1', organ: 'KIDNEY', finding: 'Microscopic Examination' }),
      record('TS', 'ts-species', { TSPARMCD: 'SPECIES', TSVAL: 'RAT' }),
      record('TS', 'ts-strain', { TSPARMCD: 'STRAIN', TSVAL: 'FISCHER 344' }),
      record('TS', 'ts-treatment', { TSPARMCD: 'TRT', TSVAL: 'Example compound' }),
    );
    const publicPackage = structuredClone(packageDocument);
    publicPackage.manifest.studyId = 'Nimort-01';
    publicPackage.manifest.standardsPackageId = 'phuse-nimble-send';
    publicPackage.manifest.counts.records = publicRecords.length;
    publicPackage.evidence.records = publicRecords;
    publicPackage.evidence.datasets = ['DM', 'TX', 'MI', 'LB', 'TS'].map((domain) => ({
      domain,
      recordCount: publicRecords.filter((item) => item.domain === domain).length,
      standard: { family: 'SEND', implementationGuide: 'SENDIG', implementationGuideVersion: '3.0' },
    }));

    const projection = projectStudyEvidence(publicPackage);
    expect(projection.study).toMatchObject({
      title: 'PhUSE Nimble SEND Study',
      evidenceClass: 'observed-public',
      species: 'RAT',
      strain: 'FISCHER 344',
      compoundName: 'Example compound',
    });
    expect(projection.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ organ: 'KIDNEY', finding: 'Tubular degeneration', incidence: [0, 1], pattern: 'treated-only' }),
    ]));
    expect(projection.signals.some((signal) => signal.finding === 'NORMAL')).toBe(false);
    expect(projection.signals.some((signal) => signal.finding === 'Microscopic Examination')).toBe(false);
    expect(new Set(projection.signals.map((signal) => signal.projectionRuleId))).toEqual(new Set(['signal.observed-microscopy-grouping.v1']));
  });
});
