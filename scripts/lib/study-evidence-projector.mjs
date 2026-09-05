import { createHash } from 'node:crypto';

export const STUDY_EVIDENCE_PROJECTION_VERSION = 'nonclinical-safety-study-evidence/v1';

const KNOWN_STUDIES = {
  'phuse-ffu-send': {
    title: 'PhUSE FFU Contribution to FDA',
    license: 'MIT',
    evidenceClass: 'observed-public',
  },
  'phuse-nimble-send': {
    title: 'PhUSE Nimble SEND Study',
    license: 'MIT',
    evidenceClass: 'observed-public',
  },
  'phuse-instem-send': {
    title: 'PhUSE Instem GLP003 Comprehensive SEND Study',
    license: 'MIT',
    evidenceClass: 'observed-public',
  },
  'phuse-pointcross-send': {
    title: 'PhUSE PointCross Recovery-Cohort SEND Study',
    license: 'MIT',
    evidenceClass: 'observed-public',
  },
};

const CURATED_SIGNAL_PACKAGES = new Set(['phuse-ffu-send', 'sendig-3.0', 'test-send']);
const NON_FINDINGS = /^(?:normal|within normal limits|no abnormalit(?:y|ies)(?: detected)?|not examined|not done|unremarkable|microscopic examination)$/i;
const MAX_GENERIC_SIGNALS = 32;

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

function tsValue(records, parameterCode) {
  const record = records.find((item) => item.domain === 'TS' && asString(item.data?.TSPARMCD).toUpperCase() === parameterCode);
  return asString(record?.data?.TSVAL || record?.data?.TSVALCD).trim();
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
    const suppliedLabel = asString(values.SETLBL?.value || values.GRPLBL?.value).trim();
    return {
      code,
      label: suppliedLabel || (dose === 0 ? 'Vehicle control' : `Dose ${dose}`),
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

function signalPattern(incidence, doseGroups, organ) {
  if (/INJECTION|ADMINISTRATION SITE/i.test(organ)) return 'local-tolerance';
  const groups = incidence.map((affected, index) => ({ affected, ...doseGroups[index] }));
  const controls = groups.filter((group) => group.dose === 0);
  const treated = groups.filter((group) => group.dose > 0).sort((left, right) => left.dose - right.dose);
  const controlAffected = controls.reduce((sum, group) => sum + group.affected, 0);
  const controlTotal = controls.reduce((sum, group) => sum + group.animalCount, 0);
  const controlRate = controlTotal ? controlAffected / controlTotal : 0;
  const treatedRates = treated.map((group) => group.animalCount ? group.affected / group.animalCount : 0);
  const treatedAffected = treated.reduce((sum, group) => sum + group.affected, 0);
  if (!treatedAffected) return controlAffected ? 'control-only' : 'sparse';
  if (!controlAffected) {
    if (treatedRates.length > 1 && treatedRates.every((rate, index) => index === 0 || rate >= treatedRates[index - 1]) && treatedRates.at(-1) > treatedRates[0]) return 'dose-responsive';
    return 'treated-only';
  }
  const maximumTreatedRate = Math.max(...treatedRates);
  if (treatedRates.length > 1 && maximumTreatedRate > controlRate && treatedRates.every((rate, index) => index === 0 || rate >= treatedRates[index - 1])) return 'dose-responsive';
  return maximumTreatedRate > controlRate ? 'non-monotonic' : 'control-and-treated';
}

function reviewPriority(pattern, incidence, doseGroups) {
  const rates = incidence.map((affected, index) => doseGroups[index].animalCount ? affected / doseGroups[index].animalCount : 0);
  const controlRate = Math.max(0, ...rates.filter((_, index) => doseGroups[index].dose === 0));
  const treatedRate = Math.max(0, ...rates.filter((_, index) => doseGroups[index].dose > 0));
  const delta = treatedRate - controlRate;
  if ((pattern === 'dose-responsive' && delta >= 0.15) || (pattern === 'treated-only' && treatedRate >= 0.2)) return 'high';
  if (pattern === 'dose-responsive' || pattern === 'treated-only' || pattern === 'local-tolerance' || delta >= 0.1) return 'medium';
  if (pattern === 'control-and-treated' || pattern === 'non-monotonic') return 'context';
  return 'low';
}

function buildObservedMicroscopySignals(records, doseGroups) {
  const demographics = records.filter((record) => record.domain === 'DM');
  const subjectGroups = new Map(demographics.map((record) => [subjectId(record), groupCode(record)]));
  const grouped = new Map();
  for (const record of records.filter((item) => item.domain === 'MI')) {
    const organ = asString(record.facets?.organ || record.data?.MISPEC).trim().toUpperCase();
    const finding = asString(record.facets?.finding || record.data?.MISTRESC || record.data?.MIORRES).trim();
    if (!organ || !finding || NON_FINDINGS.test(finding)) continue;
    const key = `${organ}\u0000${finding.toUpperCase()}`;
    if (!grouped.has(key)) grouped.set(key, { organ, finding, records: [] });
    grouped.get(key).records.push(record);
  }

  const priorityWeight = { high: 4, medium: 3, context: 2, low: 1 };
  return [...grouped.values()].map((group) => {
    const affectedSubjects = [...new Set(group.records.map(subjectId).filter(Boolean))];
    const incidence = doseGroups.map((doseGroup) => affectedSubjects.filter((id) => subjectGroups.get(id) === doseGroup.code).length);
    const pattern = signalPattern(incidence, doseGroups, group.organ);
    const severity = {};
    for (const record of group.records) {
      const value = asString(record.data?.MISEV).trim().toLowerCase() || 'ungraded';
      severity[value] = (severity[value] || 0) + 1;
    }
    return {
      id: `${group.organ.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)}-${sha256(`${group.organ}|${group.finding.toUpperCase()}`).slice(0, 10)}`,
      organ: group.organ,
      finding: group.finding,
      affectedAnimals: affectedSubjects.length,
      totalAnimals: demographics.length,
      reviewPriority: reviewPriority(pattern, incidence, doseGroups),
      pattern,
      incidence,
      severity,
      correlatedLab: null,
      sourceRecordIds: group.records.map((record) => record.sourceId).filter(Boolean).sort(),
      sourceRecordHashes: group.records.map((record) => record.lineage?.recordHash).filter(Boolean).sort(),
      projectionRuleId: 'signal.observed-microscopy-grouping.v1',
    };
  }).filter((signal) => signal.affectedAnimals > 0)
    .sort((left, right) => priorityWeight[right.reviewPriority] - priorityWeight[left.reviewPriority]
      || right.affectedAnimals - left.affectedAnimals
      || left.organ.localeCompare(right.organ)
      || left.finding.localeCompare(right.finding))
    .slice(0, MAX_GENERIC_SIGNALS);
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
  const signals = CURATED_SIGNAL_PACKAGES.has(manifest.standardsPackageId)
    ? buildSignals(records, doseGroups)
    : buildObservedMicroscopySignals(records, doseGroups);
  if (!signals.length) throw new Error('The package contains no reviewable microscopic findings');
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
  if (!study.species && tsValue(records, 'SPECIES')) study.species = tsValue(records, 'SPECIES');
  if (!study.strain && tsValue(records, 'STRAIN')) study.strain = tsValue(records, 'STRAIN');
  if (tsValue(records, 'TRT')) study.compoundName = tsValue(records, 'TRT');

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
