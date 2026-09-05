import { createHash } from 'node:crypto';

export const STUDY_EVIDENCE_PROJECTION_VERSION = 'nonclinical-safety-study-evidence/v1';
export const OPERATIONAL_EVIDENCE_PROJECTION_VERSION = 'nonclinical-safety-operational-evidence/v1';

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
  'phuse-pds-send': {
    title: 'PhUSE PDS2014 cross-domain safety and recovery study',
    license: 'MIT',
    evidenceClass: 'observed-public',
  },
};

const CURATED_SIGNAL_PACKAGES = new Set(['phuse-ffu-send', 'sendig-3.0', 'test-send']);
const NON_FINDINGS = /^(?:normal|within normal limits|no abnormalit(?:y|ies)(?: detected)?|not examined|not done|unremarkable|microscopic examination)$/i;
const MAX_GENERIC_SIGNALS = 32;

const DOMAIN_ORDER = ['DM', 'TX', 'MI', 'LB'];
const CATEGORICAL_EVIDENCE_DOMAINS = new Set(['MI', 'MA', 'CL']);
const NUMERIC_EVIDENCE_DOMAINS = new Set(['BG', 'BW', 'FW', 'LB', 'OM', 'PC', 'PP']);
const TIMELINE_DOMAINS = new Set(['BG', 'BW', 'CL', 'DS', 'EX', 'LB', 'MA', 'MI', 'OM', 'PC', 'PP', 'SE']);

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
  },
  {
    id: 'heart-infiltration',
    organ: 'HEART',
    finding: 'Mononuclear cell infiltration',
    resultPatterns: ['infiltration.*mononuclear cell'],
    reviewPriority: 'context',
    pattern: 'control-and-treated',
  },
  {
    id: 'kidney-infiltration',
    organ: 'KIDNEY',
    finding: 'Interstitial mononuclear cell infiltration',
    resultPatterns: ['infiltration.*mononuclear cell.*interstitial'],
    reviewPriority: 'medium',
    pattern: 'non-monotonic',
  },
  {
    id: 'injection-site-fibroblasts',
    organ: 'SITE, INJECTION',
    finding: 'Increased fibroblasts / mononuclear infiltration',
    resultPatterns: ['increased number.*fibroblasts', 'infiltration.*mononuclear cell'],
    reviewPriority: 'medium',
    pattern: 'local-tolerance',
  },
  {
    id: 'liver-inflammatory',
    organ: 'LIVER',
    finding: 'Inflammatory / mononuclear findings',
    resultPatterns: ['aggregates.*mononuclear cell', 'infiltration.*mixed cell'],
    reviewPriority: 'low',
    pattern: 'sparse',
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
      ...(rule.correlatedLab ? { correlatedLab: rule.correlatedLab } : {}),
      sourceRecordIds: matches.map((record) => record.sourceId).filter(Boolean).sort(),
      sourceRecordHashes: matches.map((record) => record.lineage?.recordHash).filter(Boolean).sort(),
      projectionRuleId: `signal.${rule.id}.v1`,
    };
  }).filter((signal) => signal.affectedAnimals > 0);
}

function signalPattern(incidence, doseGroups, organ) {
  if (/INJECTION|ADMINISTRATION SITE/i.test(organ)) return 'local-tolerance';
  const byDose = new Map();
  incidence.forEach((affected, index) => {
    const group = doseGroups[index];
    if (!byDose.has(group.dose)) byDose.set(group.dose, { dose: group.dose, affected: 0, animalCount: 0 });
    const aggregate = byDose.get(group.dose);
    aggregate.affected += affected;
    aggregate.animalCount += group.animalCount;
  });
  const groups = [...byDose.values()].sort((left, right) => left.dose - right.dose);
  const control = groups.find((group) => group.dose === 0) || { affected: 0, animalCount: 0 };
  const treated = groups.filter((group) => group.dose > 0);
  const controlAffected = control.affected;
  const controlRate = control.animalCount ? controlAffected / control.animalCount : 0;
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
  const byDose = new Map();
  incidence.forEach((affected, index) => {
    const group = doseGroups[index];
    if (!byDose.has(group.dose)) byDose.set(group.dose, { affected: 0, total: 0 });
    byDose.get(group.dose).affected += affected;
    byDose.get(group.dose).total += group.animalCount;
  });
  const rates = [...byDose.entries()].map(([dose, value]) => ({ dose, rate: value.total ? value.affected / value.total : 0 }));
  const controlRate = Math.max(0, ...rates.filter((item) => item.dose === 0).map((item) => item.rate));
  const treatedRate = Math.max(0, ...rates.filter((item) => item.dose > 0).map((item) => item.rate));
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

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null || item === '') return false;
    if (Array.isArray(item) && item.length === 0) return false;
    return true;
  }));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function recordDay(record) {
  return asNumber(record.facets?.studyDay
    ?? record.data?.[`${record.domain}DY`]
    ?? record.data?.VISITDY);
}

function recordTestCode(record) {
  return asString(record.facets?.testCode || record.data?.[`${record.domain}TESTCD`]).trim();
}

function recordTest(record) {
  return asString(record.facets?.test || record.data?.[`${record.domain}TEST`]).trim();
}

function recordOrgan(record) {
  return asString(record.facets?.organ || record.facets?.specimen || record.data?.[`${record.domain}SPEC`]).trim().toUpperCase();
}

function recordCharacterResult(record) {
  return asString(record.facets?.resultCharacter
    || record.facets?.finding
    || record.data?.[`${record.domain}STRESC`]
    || record.data?.[`${record.domain}ORRES`]).trim();
}

function recordNumericResult(record) {
  return asNumber(record.facets?.resultNumeric ?? record.data?.[`${record.domain}STRESN`]);
}

function recordUnit(record) {
  return asString(record.facets?.resultUnit
    || record.data?.[`${record.domain}STRESU`]
    || record.data?.[`${record.domain}ORRESU`]).trim();
}

function recordSequence(record, domain = record.domain) {
  return asString(record.data?.[`${domain}SEQ`] ?? record.facets?.sequence).trim();
}

function treatmentContexts(records, doseGroups) {
  const doseByCode = new Map(doseGroups.map((group) => [group.code, group]));
  const bySubject = new Map();
  for (const record of records.filter((item) => item.domain === 'DM')) {
    const id = subjectId(record);
    if (!id) continue;
    const code = groupCode(record);
    const arm = asString(record.facets?.arm || record.data?.ARM).trim();
    bySubject.set(id, compactObject({
      subjectId: id,
      groupCode: code,
      groupLabel: doseByCode.get(code)?.label || arm,
      dose: doseByCode.get(code)?.dose,
      doseUnit: doseByCode.get(code)?.unit,
      sex: asString(record.facets?.sex || record.data?.SEX).trim().toUpperCase(),
      arm,
      recoveryCohort: /recovery/i.test(arm),
    }));
  }
  return bySubject;
}

function terminalDay(records, contexts) {
  const days = records
    .filter((record) => record.domain === 'DS' && !contexts.get(subjectId(record))?.recoveryCohort)
    .map(recordDay)
    .filter((value) => value !== null);
  return days.length ? Math.max(...days) : 31;
}

function phaseForRecord(record, context, mainTerminalDay) {
  const element = asString(record.data?.ELEMENT || record.data?.EPOCH).toUpperCase();
  if (element.includes('RECOVERY')) return 'RECOVERY';
  const day = recordDay(record);
  if (context?.recoveryCohort && day !== null && day > mainTerminalDay) return 'RECOVERY';
  return 'MAIN';
}

function finalizeProjectionDocument(document, semanticReleaseId) {
  const clean = compactObject({
    ...document,
    sourceRecordIds: unique(document.sourceRecordIds || []),
    projectionVersion: OPERATIONAL_EVIDENCE_PROJECTION_VERSION,
    semanticReleaseId,
  });
  return {
    ...clean,
    projectionDigest: `sha256:${sha256(canonicalJson(clean))}`,
  };
}

function endpointKey(parts) {
  return parts.map((value) => asString(value).trim()).join('\u0000');
}

function endpointId(parts) {
  return `endpoint-${sha256(endpointKey(parts)).slice(0, 20)}`;
}

function referenceAssessment(record, numeric) {
  if (record.domain !== 'LB') return {};
  const lower = asNumber(record.data?.LBSTNRLO);
  const upper = asNumber(record.data?.LBSTNRHI);
  const sourceIndicator = asString(record.data?.LBNRIND).trim().toUpperCase();
  const outside = ['HIGH', 'LOW', 'ABNORMAL', 'H', 'L', 'ABN', 'A'].includes(sourceIndicator)
    || (numeric !== null && lower !== null && numeric < lower)
    || (numeric !== null && upper !== null && numeric > upper);
  return compactObject({ lower, upper, sourceIndicator, outside });
}

function buildNumericProjections(records, contexts, doseGroups, mainTerminalDay, semanticReleaseId) {
  const doseByCode = new Map(doseGroups.map((group) => [group.code, group]));
  const groups = new Map();
  for (const record of records.filter((item) => NUMERIC_EVIDENCE_DOMAINS.has(item.domain))) {
    const numeric = recordNumericResult(record);
    if (numeric === null) continue;
    const context = contexts.get(subjectId(record)) || {};
    const group = doseByCode.get(context.groupCode) || {};
    const phase = phaseForRecord(record, context, mainTerminalDay);
    const day = recordDay(record);
    const testCode = recordTestCode(record) || record.domain;
    const organ = recordOrgan(record);
    const unit = recordUnit(record);
    const keyParts = [record.domain, testCode, organ, context.groupCode, context.sex, phase, day ?? '', unit];
    const key = endpointKey(keyParts);
    if (!groups.has(key)) {
      groups.set(key, {
        keyParts,
        domain: record.domain,
        testCode,
        test: recordTest(record) || testCode,
        organ,
        unit,
        day,
        phase,
        group: compactObject({ code: context.groupCode, label: context.groupLabel, dose: group.dose, unit: group.unit }),
        sex: context.sex,
        values: [],
        subjects: [],
        sourceRecordIds: [],
        referenceAssessments: [],
      });
    }
    const target = groups.get(key);
    target.values.push(numeric);
    target.subjects.push(subjectId(record));
    target.sourceRecordIds.push(record.sourceId);
    target.referenceAssessments.push(referenceAssessment(record, numeric));
  }

  const endpointSummaries = [];
  for (const item of groups.values()) {
    const suppliedRanges = item.referenceAssessments.filter((value) => value.lower !== undefined || value.upper !== undefined || value.sourceIndicator);
    const outsideRangeCount = item.referenceAssessments.filter((value) => value.outside).length;
    endpointSummaries.push(finalizeProjectionDocument({
      id: endpointId(item.keyParts),
      endpointType: 'numeric',
      domain: item.domain,
      testCode: item.testCode,
      test: item.test,
      organ: item.organ,
      unit: item.unit,
      studyDay: item.day,
      phase: item.phase,
      sex: item.sex,
      group: item.group,
      statistics: {
        count: item.values.length,
        subjectCount: unique(item.subjects).length,
        mean: mean(item.values),
        min: Math.min(...item.values),
        max: Math.max(...item.values),
      },
      referenceRange: {
        status: suppliedRanges.length ? 'source-supplied' : 'not-supplied',
        assessedCount: suppliedRanges.length,
        outsideRangeCount,
      },
      sourceRecordIds: item.sourceRecordIds,
    }, semanticReleaseId));
  }

  const seriesGroups = new Map();
  for (const summary of endpointSummaries) {
    const keyParts = [summary.domain, summary.testCode, summary.organ, summary.sex, summary.phase, summary.unit];
    const key = endpointKey(keyParts);
    if (!seriesGroups.has(key)) {
      seriesGroups.set(key, {
        keyParts,
        domain: summary.domain,
        testCode: summary.testCode,
        test: summary.test,
        organ: summary.organ,
        unit: summary.unit,
        sex: summary.sex,
        phase: summary.phase,
        points: [],
        sourceRecordIds: [],
      });
    }
    const series = seriesGroups.get(key);
    series.points.push(compactObject({
      endpointSummaryId: summary.id,
      studyDay: summary.studyDay,
      group: summary.group,
      statistics: summary.statistics,
      referenceRange: summary.referenceRange,
    }));
    series.sourceRecordIds.push(...summary.sourceRecordIds);
  }
  const measurementSeries = [...seriesGroups.values()].map((series) => finalizeProjectionDocument({
    id: `series-${sha256(endpointKey(series.keyParts)).slice(0, 20)}`,
    domain: series.domain,
    testCode: series.testCode,
    test: series.test,
    organ: series.organ,
    unit: series.unit,
    sex: series.sex,
    phase: series.phase,
    points: series.points.sort((left, right) => (left.studyDay ?? 0) - (right.studyDay ?? 0)
      || asString(left.group?.code).localeCompare(asString(right.group?.code))),
    sourceRecordIds: series.sourceRecordIds,
  }, semanticReleaseId));
  return { endpointSummaries, measurementSeries };
}

function buildCategoricalEndpointSummaries(records, contexts, doseGroups, mainTerminalDay, semanticReleaseId) {
  const doseByCode = new Map(doseGroups.map((group) => [group.code, group]));
  const examined = new Map();
  const findings = new Map();
  for (const record of records.filter((item) => CATEGORICAL_EVIDENCE_DOMAINS.has(item.domain))) {
    const context = contexts.get(subjectId(record)) || {};
    const phase = phaseForRecord(record, context, mainTerminalDay);
    const day = recordDay(record);
    const testCode = recordTestCode(record) || record.domain;
    const organ = recordOrgan(record);
    const universeKey = endpointKey([record.domain, testCode, organ, context.groupCode, context.sex, phase, day ?? '']);
    if (!examined.has(universeKey)) examined.set(universeKey, new Set());
    if (subjectId(record)) examined.get(universeKey).add(subjectId(record));
    const result = recordCharacterResult(record);
    if (!result || NON_FINDINGS.test(result)) continue;
    const keyParts = [record.domain, testCode, organ, result.toUpperCase(), context.groupCode, context.sex, phase, day ?? ''];
    const key = endpointKey(keyParts);
    if (!findings.has(key)) {
      findings.set(key, {
        keyParts,
        universeKey,
        domain: record.domain,
        testCode,
        test: recordTest(record) || testCode,
        organ,
        finding: result,
        day,
        phase,
        sex: context.sex,
        groupCode: context.groupCode,
        groupLabel: context.groupLabel,
        subjects: [],
        severities: {},
        sourceRecordIds: [],
      });
    }
    const target = findings.get(key);
    target.subjects.push(subjectId(record));
    const severity = asString(record.data?.[`${record.domain}SEV`] || record.facets?.severity).trim().toUpperCase();
    if (severity) target.severities[severity] = (target.severities[severity] || 0) + 1;
    target.sourceRecordIds.push(record.sourceId);
  }

  return [...findings.values()].map((item) => {
    const group = doseByCode.get(item.groupCode) || {};
    const affected = unique(item.subjects).length;
    const denominator = examined.get(item.universeKey)?.size || group.animalCount || affected;
    return finalizeProjectionDocument({
      id: endpointId(item.keyParts),
      endpointType: 'categorical',
      domain: item.domain,
      testCode: item.testCode,
      test: item.test,
      organ: item.organ,
      finding: item.finding,
      studyDay: item.day,
      phase: item.phase,
      sex: item.sex,
      group: compactObject({ code: item.groupCode, label: item.groupLabel, dose: group.dose, unit: group.unit }),
      incidence: {
        affected,
        examined: denominator,
        percent: denominator ? Number(((affected / denominator) * 100).toFixed(2)) : 0,
      },
      severity: item.severities,
      sourceRecordIds: item.sourceRecordIds,
    }, semanticReleaseId);
  });
}

function timelineEvent(record, context, mainTerminalDay) {
  return compactObject({
    sourceRecordId: record.sourceId,
    domain: record.domain,
    studyDay: recordDay(record),
    phase: phaseForRecord(record, context, mainTerminalDay),
    testCode: recordTestCode(record),
    test: recordTest(record),
    organ: recordOrgan(record),
    result: recordCharacterResult(record),
    numericResult: recordNumericResult(record),
    unit: recordUnit(record),
    severity: asString(record.data?.[`${record.domain}SEV`] || record.facets?.severity).trim().toUpperCase(),
    element: asString(record.data?.ELEMENT).trim(),
  });
}

function buildSubjectTimelines(records, contexts, mainTerminalDay, semanticReleaseId) {
  const eventsBySubject = new Map([...contexts.keys()].map((id) => [id, []]));
  for (const record of records.filter((item) => TIMELINE_DOMAINS.has(item.domain))) {
    const id = subjectId(record);
    if (!id || !eventsBySubject.has(id)) continue;
    eventsBySubject.get(id).push(timelineEvent(record, contexts.get(id), mainTerminalDay));
  }
  return [...eventsBySubject.entries()].map(([id, events]) => {
    const context = contexts.get(id) || {};
    events.sort((left, right) => (left.studyDay ?? Number.MAX_SAFE_INTEGER) - (right.studyDay ?? Number.MAX_SAFE_INTEGER)
      || left.domain.localeCompare(right.domain)
      || left.sourceRecordId.localeCompare(right.sourceRecordId));
    const domainCounts = events.reduce((counts, event) => {
      counts[event.domain] = (counts[event.domain] || 0) + 1;
      return counts;
    }, {});
    return finalizeProjectionDocument({
      id: `timeline-${sha256(id).slice(0, 20)}`,
      subjectId: id,
      group: compactObject({ code: context.groupCode, label: context.groupLabel, dose: context.dose, unit: context.doseUnit }),
      sex: context.sex,
      recoveryCohort: context.recoveryCohort || undefined,
      domainCounts,
      events,
      sourceRecordIds: events.map((event) => event.sourceRecordId),
    }, semanticReleaseId);
  });
}

const DOMAIN_SEMANTIC_OBJECT = {
  BG: 'BodyWeightMeasurement', BW: 'BodyWeightMeasurement', CL: 'ClinicalObservation',
  EX: 'ExposureAdministration', FW: 'FoodConsumption', LB: 'LabMeasurement',
  MA: 'MacroscopicFinding', MI: 'Finding', OM: 'OrganMeasurement',
  PC: 'PkConcentration', PP: 'PkParameter', SE: 'StudyPhase',
};

function canonicalRecordRef(record) {
  return `CanonicalRecord:${record.sourceId}`;
}

function buildEvidenceRelationships(records, contexts, semanticReleaseId) {
  const relationships = [];
  const recordByDeclaredKey = new Map();
  const demographicSourceIdsBySubject = new Map();
  for (const record of records) {
    const sequence = recordSequence(record);
    const id = subjectId(record);
    if (sequence && id) recordByDeclaredKey.set(endpointKey([record.domain, id, sequence]), record);
    if (record.domain === 'DM' && id) {
      if (!demographicSourceIdsBySubject.has(id)) demographicSourceIdsBySubject.set(id, []);
      demographicSourceIdsBySubject.get(id).push(record.sourceId);
    }
  }
  const relrecGroups = new Map();
  for (const record of records.filter((item) => item.domain === 'RELREC')) {
    const relationId = asString(record.data?.RELID).trim();
    const id = subjectId(record);
    const target = recordByDeclaredKey.get(endpointKey([record.data?.RDOMAIN, id, record.data?.IDVARVAL]));
    if (!relationId || !target) continue;
    const key = endpointKey([id, relationId]);
    if (!relrecGroups.has(key)) relrecGroups.set(key, { relationId, subjectId: id, members: [], relrecSourceIds: [] });
    relrecGroups.get(key).members.push(target);
    relrecGroups.get(key).relrecSourceIds.push(record.sourceId);
  }
  for (const group of relrecGroups.values()) {
    const members = [...new Map(group.members.map((record) => [record.sourceId, record])).values()]
      .sort((left, right) => canonicalRecordRef(left).localeCompare(canonicalRecordRef(right)));
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        const source = members[left];
        const target = members[right];
        relationships.push(finalizeProjectionDocument({
          id: `relationship-${sha256(endpointKey(['source', group.subjectId, group.relationId, source.sourceId, target.sourceId])).slice(0, 20)}`,
          from: canonicalRecordRef(source),
          to: canonicalRecordRef(target),
          fromSemanticObject: DOMAIN_SEMANTIC_OBJECT[source.domain] || 'CanonicalRecord',
          toSemanticObject: DOMAIN_SEMANTIC_OBJECT[target.domain] || 'CanonicalRecord',
          predicate: 'source:relatedRecord',
          authority: 'source-declared',
          relationId: group.relationId,
          subjectId: group.subjectId,
          sourceRecordIds: [...group.relrecSourceIds, source.sourceId, target.sourceId],
        }, semanticReleaseId));
      }
    }
  }

  for (const [id, context] of contexts) {
    relationships.push(finalizeProjectionDocument({
      id: `relationship-${sha256(endpointKey(['subject-group', id, context.groupCode])).slice(0, 20)}`,
      from: `Subject:${id}`,
      to: `TreatmentGroup:${context.groupCode}`,
      fromSemanticObject: 'Subject',
      toSemanticObject: 'TreatmentGroup',
      predicate: 'safety:assignedTo',
      authority: 'governed-inference',
      ruleId: 'relationship.subject-treatment-group.v1',
      subjectId: id,
      groupCode: context.groupCode,
      sourceRecordIds: demographicSourceIdsBySubject.get(id) || [],
    }, semanticReleaseId));
  }
  for (const record of records.filter((item) => DOMAIN_SEMANTIC_OBJECT[item.domain] && subjectId(item))) {
    relationships.push(finalizeProjectionDocument({
      id: `relationship-${sha256(endpointKey(['record-subject', record.sourceId, subjectId(record)])).slice(0, 20)}`,
      from: canonicalRecordRef(record),
      to: `Subject:${subjectId(record)}`,
      fromSemanticObject: DOMAIN_SEMANTIC_OBJECT[record.domain],
      toSemanticObject: 'Subject',
      predicate: 'safety:observedForSubject',
      authority: 'governed-inference',
      ruleId: 'relationship.record-subject.v1',
      subjectId: subjectId(record),
      sourceRecordIds: [record.sourceId],
    }, semanticReleaseId));
  }
  return relationships;
}

export function projectOperationalEvidence(packageDocument, options = {}) {
  const semanticReleaseId = options.semanticReleaseId;
  if (!semanticReleaseId) throw new Error('semanticReleaseId is required for operational projections');
  const records = packageDocument.evidence.records;
  const doseGroups = buildDoseGroups(records);
  const contexts = treatmentContexts(records, doseGroups);
  const mainTerminalDay = terminalDay(records, contexts);
  const numeric = buildNumericProjections(records, contexts, doseGroups, mainTerminalDay, semanticReleaseId);
  const categorical = buildCategoricalEndpointSummaries(records, contexts, doseGroups, mainTerminalDay, semanticReleaseId);
  const endpointSummaries = [...categorical, ...numeric.endpointSummaries]
    .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id));
  const measurementSeries = numeric.measurementSeries
    .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id));
  const subjectTimelines = buildSubjectTimelines(records, contexts, mainTerminalDay, semanticReleaseId)
    .sort((left, right) => left.subjectId.localeCompare(right.subjectId));
  const evidenceRelationships = buildEvidenceRelationships(records, contexts, semanticReleaseId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const knownSourceIds = new Set(records.map((record) => record.sourceId));
  const referencedSourceIds = new Set([
    ...endpointSummaries,
    ...measurementSeries,
    ...subjectTimelines,
    ...evidenceRelationships,
  ].flatMap((item) => item.sourceRecordIds || []));
  const unknownSourceIds = [...referencedSourceIds].filter((id) => !knownSourceIds.has(id));
  if (unknownSourceIds.length) throw new Error(`Operational projections reference unknown source records: ${unknownSourceIds.slice(0, 5).join(', ')}`);
  return {
    projectionVersion: OPERATIONAL_EVIDENCE_PROJECTION_VERSION,
    semanticReleaseId,
    mainTerminalDay,
    endpointSummaries,
    measurementSeries,
    subjectTimelines,
    evidenceRelationships,
    reconciliation: {
      status: 'reconciled',
      canonicalRecordCount: records.length,
      referencedCanonicalRecordCount: referencedSourceIds.size,
      subjectCount: contexts.size,
      checks: { allReferencesResolve: true, oneTimelinePerSubject: subjectTimelines.length === contexts.size },
    },
  };
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
    ...(Object.keys(labSeries).length ? { labSeries } : {}),
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
