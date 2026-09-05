import { createHash } from 'node:crypto';

export const STUDY_EVIDENCE_PROJECTION_VERSION = 'nonclinical-safety-study-evidence/v1';

const KNOWN_STUDIES = {
  'phuse-ffu-send': {
    title: 'PhUSE FFU Contribution to FDA',
    license: 'MIT',
    evidenceClass: 'observed-public',
  },
};

const DOMAIN_ORDER = ['DM', 'TX', 'MI', 'LB'];

// These are solution semantics, not source data. They state which SEND
// microscopic observations the safety workflow presents as one review signal.
export const SAFETY_SIGNAL_POLICY = [
  {
    id: 'thymus-lymphocytes',
    organ: 'THYMUS',
    finding: 'Decreased number, lymphocytes, cortex',
    resultPatterns: ['decreased(?: number)?.*lymphocytes.*cortex'],
    reviewPriority: 'high',
    pattern: 'treated-only',
    correlatedLab: 'LYM',
  },
  {
    id: 'lung-infiltration',
    organ: 'LUNG',
    finding: 'Mononuclear cell infiltration',
    resultPatterns: ['(?:infiltration.*mononuclear cell|mononuclear cell.*infiltration)'],
    reviewPriority: 'context',
    pattern: 'control-and-treated',
    correlatedLab: null,
  },
  {
    id: 'heart-infiltration',
    organ: 'HEART',
    finding: 'Mononuclear cell infiltration',
    resultPatterns: ['infiltration.*mononuclear cell'],
    reviewPriority: 'context',
    pattern: 'control-and-treated',
    correlatedLab: null,
  },
  {
    id: 'kidney-infiltration',
    organ: 'KIDNEY',
    finding: 'Interstitial mononuclear cell infiltration',
    resultPatterns: ['infiltration.*mononuclear cell.*interstitial'],
    reviewPriority: 'medium',
    pattern: 'non-monotonic',
    correlatedLab: null,
  },
  {
    id: 'injection-site-fibroblasts',
    organ: 'SITE, INJECTION',
    finding: 'Increased fibroblasts / mononuclear infiltration',
    resultPatterns: ['increased number.*fibroblasts', 'infiltration.*mononuclear cell'],
    reviewPriority: 'medium',
    pattern: 'local-tolerance',
    correlatedLab: null,
  },
  {
    id: 'liver-inflammatory',
    organ: 'LIVER',
    finding: 'Inflammatory / mononuclear findings',
    resultPatterns: ['aggregates.*mononuclear cell', 'infiltration.*mixed cell'],
    reviewPriority: 'low',
    pattern: 'sparse',
    correlatedLab: null,
  },
];

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function asString(value) {
  return value == null ? '' : String(value);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mean(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function groupCode(record) {
  return asString(record?.facets?.treatmentGroup || record?.data?.SPGRPCD || record?.data?.SETCD || record?.data?.ARMCD);
}

function subjectId(record) {
  return asString(record?.facets?.subjectId || record?.data?.USUBJID);
}

function sourceMetadata(artifacts) {
  const metadata = artifacts.map((artifact) => artifact.metadata || {}).find((item) => item.sourceRepository) || {};
  return {
    repository: asString(metadata.sourceRepository),
    revision: asString(metadata.sourceRevision),
  };
}

function buildDoseGroups(records) {
  const demographics = records.filter((record) => record.domain === 'DM');
  const treatment = records.filter((record) => record.domain === 'TX');
  const parameters = new Map();
  for (const record of treatment) {
    const code = groupCode(record);
    if (!code) continue;
    if (!parameters.has(code)) parameters.set(code, {});
    const parameter = asString(record.data?.TXPARMCD);
    parameters.get(code)[parameter] = {
      value: record.data?.TXVAL,
      numeric: record.data?.TXVALN,
      unit: record.data?.TXVALU,
    };
  }
  return [...parameters.entries()].map(([code, values]) => {
    const dose = asNumber(values.TRTDOS?.numeric ?? values.TRTDOS?.value);
    if (dose === null) throw new Error(`TX group ${code} does not define a numeric TRTDOS`);
    const animalCount = demographics.filter((record) => groupCode(record) === code).length;
    return {
      code,
      label: dose === 0 ? 'Vehicle control' : `Dose ${dose}`,
      dose,
      unit: asString(values.TRTDOSU?.value || values.TRTDOS?.unit) || 'dose unit not supplied',
      animalCount,
    };
  }).sort((left, right) => left.dose - right.dose || left.code.localeCompare(right.code));
}

function buildSignals(records, doseGroups) {
  const demographics = records.filter((record) => record.domain === 'DM');
  const subjectGroups = new Map(demographics.map((record) => [subjectId(record), groupCode(record)]));
  const microscopy = records.filter((record) => record.domain === 'MI');

  return SAFETY_SIGNAL_POLICY.map((rule) => {
    const patterns = rule.resultPatterns.map((pattern) => new RegExp(pattern, 'i'));
    const matches = microscopy.filter((record) => {
      const organ = asString(record.facets?.organ || record.data?.MISPEC);
      const finding = asString(record.facets?.finding || record.data?.MISTRESC || record.data?.MIORRES);
      return organ === rule.organ && patterns.some((pattern) => pattern.test(finding));
    });
    const affectedSubjects = [...new Set(matches.map(subjectId).filter(Boolean))];
    const incidence = doseGroups.map((group) => affectedSubjects.filter((id) => subjectGroups.get(id) === group.code).length);
    const severity = {};
    for (const record of matches) {
      const value = asString(record.data?.MISEV).trim().toLowerCase() || 'ungraded';
      severity[value] = (severity[value] || 0) + 1;
    }
    return {
      id: rule.id,
      organ: rule.organ,
      finding: rule.finding,
      affectedAnimals: affectedSubjects.length,
      totalAnimals: demographics.length,
      reviewPriority: rule.reviewPriority,
      pattern: rule.pattern,
      incidence,
      severity,
      correlatedLab: rule.correlatedLab,
      sourceRecordIds: matches.map((record) => record.sourceId).filter(Boolean).sort(),
      sourceRecordHashes: matches.map((record) => record.lineage?.recordHash).filter(Boolean).sort(),
      projectionRuleId: `signal.${rule.id}.v1`,
    };
  }).filter((signal) => signal.affectedAnimals > 0);
}

function buildLabSeries(records, signals, doseGroups) {
  const demographics = records.filter((record) => record.domain === 'DM');
  const subjectGroups = new Map(demographics.map((record) => [subjectId(record), groupCode(record)]));
  const requestedTests = [...new Set(signals.map((signal) => signal.correlatedLab).filter(Boolean))];
  const result = {};
  for (const testCode of requestedTests) {
    const rows = records.filter((record) => record.domain === 'LB' && asString(record.facets?.testCode || record.data?.LBTESTCD) === testCode);
    const days = [...new Set(rows.map((record) => asNumber(record.facets?.studyDay ?? record.data?.LBDY)).filter((value) => value !== null))].sort((a, b) => a - b);
    const first = rows[0];
    const points = days.map((day) => {
      const point = { day };
      for (const group of doseGroups) {
        const values = rows
          .filter((record) => asNumber(record.facets?.studyDay ?? record.data?.LBDY) === day && subjectGroups.get(subjectId(record)) === group.code)
          .map((record) => asNumber(record.facets?.resultNumeric ?? record.data?.LBSTRESN))
          .filter((value) => value !== null);
        if (values.length) point[String(group.dose)] = mean(values);
      }
      return point;
    }).filter((point) => doseGroups.every((group) => point[String(group.dose)] !== undefined));
    result[testCode] = {
      label: asString(first?.facets?.test || first?.data?.LBTEST || testCode),
      unit: asString(first?.facets?.resultUnit || first?.data?.LBSTRESU),
      points,
      sourceRecordIds: rows.map((record) => record.sourceId).filter(Boolean).sort(),
      sourceRecordHashes: rows.map((record) => record.lineage?.recordHash).filter(Boolean).sort(),
    };
  }
  return result;
}

function projectionReconciliation(packageDocument, domainCounts, animalCount) {
  const { evidence, manifest } = packageDocument;
  const datasetCounts = Object.fromEntries(evidence.datasets.map((dataset) => [dataset.domain, dataset.recordCount]));
  const domainCountsMatch = Object.entries(domainCounts).every(([domain, count]) => datasetCounts[domain] === count);
  const recordCountMatches = evidence.records.length === manifest.counts.records
    && Object.values(domainCounts).reduce((sum, count) => sum + count, 0) === manifest.counts.records;
  const subjectCountMatches = new Set(evidence.records.filter((record) => record.domain === 'DM').map(subjectId)).size === animalCount;
  if (!domainCountsMatch || !recordCountMatches || !subjectCountMatches) {
    throw new Error('Study evidence projection did not reconcile to the canonical package');
  }
  return {
    status: 'reconciled',
    canonicalRecordCount: manifest.counts.records,
    projectedDomainCounts: domainCounts,
    animalCount,
    checks: { domainCountsMatch, recordCountMatches, subjectCountMatches },
  };
}

export function projectStudyEvidence(packageDocument, options = {}) {
  const { evidence, manifest, modelSchemaVersion } = packageDocument;
  const records = evidence.records;
  const datasets = [...evidence.datasets].sort((left, right) => {
    const leftIndex = DOMAIN_ORDER.indexOf(left.domain);
    const rightIndex = DOMAIN_ORDER.indexOf(right.domain);
    return (leftIndex < 0 ? DOMAIN_ORDER.length : leftIndex) - (rightIndex < 0 ? DOMAIN_ORDER.length : rightIndex)
      || left.domain.localeCompare(right.domain);
  });
  const doseGroups = buildDoseGroups(records);
  const signals = buildSignals(records, doseGroups);
  if (!signals.length) throw new Error('The package contains no microscopic findings covered by the solution signal policy');
  const labSeries = buildLabSeries(records, signals, doseGroups);
  const domainCounts = Object.fromEntries(datasets.map((dataset) => [dataset.domain, dataset.recordCount]));
  const demographics = records.filter((record) => record.domain === 'DM');
  const standard = datasets[0]?.standard || {};
  const source = sourceMetadata(evidence.sourceArtifacts);
  const known = KNOWN_STUDIES[manifest.standardsPackageId] || {};
  const firstDemographic = demographics[0]?.data || {};
  const sourceArtifacts = Object.fromEntries(evidence.sourceArtifacts.map((artifact) => [
    artifact.sourceName || artifact.sourceId,
    `${artifact.digest.algorithm}:${artifact.digest.value}`,
  ]));
  const derivedAt = evidence.snapshot.publishedAt || evidence.snapshot.createdAt;
  const reconciliation = projectionReconciliation(packageDocument, domainCounts, demographics.length);

  const study = {
      id: manifest.studyId,
      title: known.title || manifest.studyId,
      profile: asString(standard.family || manifest.profile).toUpperCase(),
      implementationGuide: `${standard.implementationGuide || ''} ${standard.implementationGuideVersion || ''}`.trim(),
      snapshotId: manifest.snapshotId,
      state: manifest.publicationState,
      source: source.repository,
      sourceRevision: source.revision,
      license: known.license || 'See source terms',
      recordCount: manifest.counts.records,
      animalCount: demographics.length,
      domains: datasets.map((dataset) => dataset.domain),
      domainCounts,
      evidenceClass: options.evidenceClass || known.evidenceClass || 'sponsor-observed',
  };
  if (asString(firstDemographic.SPECIES)) study.species = asString(firstDemographic.SPECIES);
  if (asString(firstDemographic.STRAIN)) study.strain = asString(firstDemographic.STRAIN);

  const projection = {
    study,
    doseGroups,
    signals,
    labSeries,
    provenance: {
      derivedAt,
      method: `Deterministic ${STUDY_EVIDENCE_PROJECTION_VERSION} projection of checksum-verified canonical SEND records`,
      disclaimer: 'Demonstration data only. Signals are review hypotheses, not toxicologic conclusions.',
      sourceArtifacts,
      evidencePackageId: manifest.packageId,
      evidencePackageDigest: manifest.contentDigest,
      modelSchemaVersion,
      projectionVersion: STUDY_EVIDENCE_PROJECTION_VERSION,
      projectionRuleIds: signals.map((signal) => signal.projectionRuleId),
      reconciliation,
    },
  };
  projection.provenance.projectionDigest = {
    algorithm: 'sha256',
    value: sha256(canonicalJson(projection)),
  };
  return projection;
}
