import type {
  BiologicalCoherenceResponse,
  DataQueryTrace,
  EndpointSummary,
  LaboratoryAbnormalitySummary,
  OperationalEvidenceRelationship,
  OperationalMeasurementSeries,
  OperationalSubjectTimeline,
  SafetySignal,
  SemanticResolver,
} from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';
import { summarizeMongoExplain } from '@/lib/data/mongodb-explain';

type StoredProjection = Record<string, unknown> & {
  studyId: string;
  snapshotId: string;
};

function publicProjection<T>(value: StoredProjection): T {
  const document: Record<string, unknown> = { ...value };
  delete document._id;
  delete document.studyId;
  delete document.snapshotId;
  delete document.evidencePackageId;
  delete document.modelSchemaVersion;
  return document as T;
}

function values(items: Array<string | undefined>): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item)))].sort();
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

type LaboratoryAbnormalityRecord = {
  sourceId: string;
  facets?: { subjectId?: string; testCode?: string };
  data?: Record<string, unknown>;
};

export function summarizeLaboratoryAbnormalities(
  records: LaboratoryAbnormalityRecord[],
  selectedSignalSubjectIds: string[],
): { summaries: LaboratoryAbnormalitySummary[]; selectedSignalSubjectCount: number } {
  type AbnormalityGroup = {
    testCode: string;
    test: string;
    unit?: string;
    records: LaboratoryAbnormalityRecord[];
    subjectIds: Set<string>;
    signalSubjectIds: Set<string>;
    low: number;
    high: number;
    sourceFlagged: number;
    observed: number[];
    lowerLimits: number[];
    upperLimits: number[];
  };
  const selectedSubjects = new Set(selectedSignalSubjectIds);
  const abnormalitiesByTest = new Map<string, AbnormalityGroup>();
  for (const record of records) {
    const testCode = String(record.facets?.testCode || record.data?.LBTESTCD || 'LB');
    const test = String(record.data?.LBTEST || testCode);
    const unit = String(record.data?.LBSTRESU || record.data?.LBORRESU || '') || undefined;
    const key = `${testCode}\u0000${unit || ''}`;
    if (!abnormalitiesByTest.has(key)) abnormalitiesByTest.set(key, { testCode, test, unit, records: [], subjectIds: new Set(), signalSubjectIds: new Set(), low: 0, high: 0, sourceFlagged: 0, observed: [], lowerLimits: [], upperLimits: [] });
    const group = abnormalitiesByTest.get(key)!;
    group.records.push(record);
    const id = String(record.facets?.subjectId || record.data?.USUBJID || record.data?.SUBJID || '');
    if (id) group.subjectIds.add(id);
    if (id && selectedSubjects.has(id)) group.signalSubjectIds.add(id);
    const indicator = String(record.data?.LBNRIND || '').toUpperCase();
    const result = optionalNumber(record.data?.LBSTRESN);
    const lower = optionalNumber(record.data?.LBSTNRLO);
    const upper = optionalNumber(record.data?.LBSTNRHI);
    if (result !== undefined) group.observed.push(result);
    if (lower !== undefined) group.lowerLimits.push(lower);
    if (upper !== undefined) group.upperLimits.push(upper);
    if (['LOW', 'L'].includes(indicator) || (result !== undefined && lower !== undefined && result < lower)) group.low += 1;
    else if (['HIGH', 'H'].includes(indicator) || (result !== undefined && upper !== undefined && result > upper)) group.high += 1;
    else group.sourceFlagged += 1;
  }
  const selectedAbnormalSubjects = new Set<string>();
  const summaries = [...abnormalitiesByTest.values()]
    .sort((left, right) => right.records.length - left.records.length || left.testCode.localeCompare(right.testCode))
    .map((group) => {
      group.signalSubjectIds.forEach((id) => selectedAbnormalSubjects.add(id));
      return {
        testCode: group.testCode,
        test: group.test,
        ...(group.unit ? { unit: group.unit } : {}),
        outsideRangeResults: group.records.length,
        subjectCount: group.subjectIds.size,
        signalSubjectCount: group.signalSubjectIds.size,
        directionCounts: { low: group.low, high: group.high, sourceFlagged: group.sourceFlagged },
        ...(group.observed.length ? { observedRange: { min: Math.min(...group.observed), max: Math.max(...group.observed) } } : {}),
        ...(group.lowerLimits.length || group.upperLimits.length ? { suppliedLimits: { ...(group.lowerLimits.length ? { lowest: Math.min(...group.lowerLimits) } : {}), ...(group.upperLimits.length ? { highest: Math.max(...group.upperLimits) } : {}) } } : {}),
        sourceRecordIds: group.records.map((record) => record.sourceId),
      } satisfies LaboratoryAbnormalitySummary;
    });
  return { summaries, selectedSignalSubjectCount: selectedAbnormalSubjects.size };
}

export async function loadBiologicalCoherence(
  studyId: string,
  snapshotId: string,
  signal: SafetySignal,
  semanticReleaseId: string,
  resolver: SemanticResolver,
): Promise<BiologicalCoherenceResponse> {
  const database = await solutionDatabase();
  const traces: DataQueryTrace[] = [];
  const empty = {
    available: false,
    studyId,
    snapshotId,
    signalId: signal.id,
    organ: signal.organ,
    semanticReleaseId,
    targetOrgan: { endpointSummaries: [], measurementSeries: [] },
    systemicContext: {
      bodyWeightSeries: [],
      foodConsumptionSeries: [],
      exposureSeries: [],
      measurementEndpoints: [],
      clinicalObservations: [],
      subjectTimelines: [],
      laboratoryCoverage: {
        endpointSummaryCount: 0,
        sourceRangeSummaryCount: 0,
        outsideRangeSummaryCount: 0,
        outsideRangeResultCount: 0,
        signalSubjectCount: 0,
        interpretation: 'Operational evidence projections are not available in portable mode.',
      },
      laboratoryAbnormalities: [],
    },
    relationships: [],
    filters: { sexes: [], phases: [] },
    inventory: { endpointSummaries: 0, measurementSeries: 0, sourceDeclaredRelationships: 0, sourceRecordCitations: 0, domainCounts: {} },
    execution: {
      resolverId: resolver.id,
      capabilityId: resolver.capability,
      executor: resolver.executor,
      policies: resolver.policy,
      declaredStages: resolver.stages,
      containmentPlan: resolver.containmentPlan,
      dataOperations: [{ id: 'operational-projections', source: 'portable-bundle', collection: 'study_endpoint_summaries', operation: 'fixture-read', predicate: { studyId, snapshotId, organ: signal.organ }, status: 'fallback', resultCount: 0, durationMs: 0 }],
      executedAt: new Date().toISOString(),
    },
  } satisfies BiologicalCoherenceResponse;
  if (!database) return empty;
  const db = database;

  async function tracedFind<T>(id: string, collectionName: string, predicate: Record<string, unknown>, limit: number): Promise<T[]> {
    const startedAt = Date.now();
    const sort = { sex: 1, phase: 1, 'group.dose': 1, studyDay: 1, domain: 1, testCode: 1 } as const;
    const collection = db.collection<StoredProjection>(collectionName);
    const documents = await collection.find(predicate, { projection: { _id: 0, importedAt: 0 } }).sort(sort).limit(limit).toArray();
    const durationMs = Date.now() - startedAt;
    let plan: DataQueryTrace['plan'];
    try {
      plan = summarizeMongoExplain(await collection.find(predicate, { projection: { _id: 0, importedAt: 0 } }).sort(sort).limit(limit).explain('executionStats'), documents.length);
    } catch {
      // Query results remain usable when the connected role cannot run explain.
    }
    traces.push({ id, source: 'mongodb', collection: collectionName, operation: 'find', predicate, status: 'executed', resultCount: documents.length, durationMs, ...(plan ? { plan } : {}) });
    return documents.map((item) => publicProjection<T>(item));
  }

  const scope = { studyId, snapshotId, semanticReleaseId };
  const targetEndpointPredicate = { ...scope, organ: signal.organ };
  const targetSeriesPredicate = { ...scope, organ: signal.organ };
  const bodyWeightPredicate = { ...scope, domain: { $in: ['BW', 'BG'] } };
  const foodConsumptionPredicate = { ...scope, domain: 'FW' };
  const exposurePredicate = { ...scope, domain: { $in: ['PC', 'PP'] } };
  const measurementEndpointPredicate = { ...scope, domain: { $in: ['BW', 'BG', 'FW', 'OM', 'PC', 'PP'] } };
  const clinicalObservationPredicate = { ...scope, domain: 'CL' };
  const relationshipPredicate = signal.sourceRecordIds?.length
    ? { ...scope, authority: 'source-declared', sourceRecordIds: { $in: signal.sourceRecordIds } }
    : { ...scope, authority: 'source-declared', subjectId: { $exists: true } };

  const [endpointSummaries, targetSeries, bodyWeightSeries, foodConsumptionSeries, exposureSeries, measurementEndpoints, clinicalObservations, relationships, laboratoryEndpoints] = await Promise.all([
    tracedFind<EndpointSummary>('target-organ-endpoints', 'study_endpoint_summaries', targetEndpointPredicate, 500),
    tracedFind<OperationalMeasurementSeries>('target-organ-measurements', 'measurement_series', targetSeriesPredicate, 100),
    tracedFind<OperationalMeasurementSeries>('body-weight-series', 'measurement_series', bodyWeightPredicate, 100),
    tracedFind<OperationalMeasurementSeries>('food-consumption-series', 'measurement_series', foodConsumptionPredicate, 100),
    tracedFind<OperationalMeasurementSeries>('systemic-exposure-series', 'measurement_series', exposurePredicate, 100),
    tracedFind<EndpointSummary>('measurement-endpoints', 'study_endpoint_summaries', measurementEndpointPredicate, 5000),
    tracedFind<EndpointSummary>('clinical-observations', 'study_endpoint_summaries', clinicalObservationPredicate, 2000),
    tracedFind<OperationalEvidenceRelationship>('source-declared-relationships', 'evidence_relationships', relationshipPredicate, 100),
    tracedFind<EndpointSummary>('laboratory-endpoints', 'study_endpoint_summaries', { ...scope, domain: 'LB' }, 10000),
  ]);

  const coverage = {
    endpointSummaryCount: laboratoryEndpoints.length,
    sourceRangeSummaryCount: laboratoryEndpoints.filter((item) => item.referenceRange?.status === 'source-supplied').length,
    outsideRangeSummaryCount: laboratoryEndpoints.filter((item) => (item.referenceRange?.outsideRangeCount || 0) > 0).length,
  };

  const canonicalRecords = db.collection<{
    sourceId: string;
    facets?: { subjectId?: string };
    data?: Record<string, unknown>;
  }>('cdisc_records');
  const signalSubjectStartedAt = Date.now();
  const signalSourcePredicate = signal.sourceRecordIds?.length
    ? { studyId, snapshotId, domain: 'MI', sourceId: { $in: signal.sourceRecordIds } }
    : { studyId, snapshotId, domain: 'MI', sourceId: { $in: [] } };
  const signalSourceRecords = signal.sourceRecordIds?.length
    ? await canonicalRecords.find(signalSourcePredicate, { projection: { _id: 0, sourceId: 1, 'facets.subjectId': 1, 'data.USUBJID': 1, 'data.SUBJID': 1 } }).toArray()
    : [];
  const signalSubjectIds = values(signalSourceRecords.map((record) => String(record.facets?.subjectId || record.data?.USUBJID || record.data?.SUBJID || '')));
  traces.push({
    id: 'signal-subject-identities',
    source: 'mongodb',
    collection: 'cdisc_records',
    operation: 'find',
    predicate: signalSourcePredicate,
    status: 'executed',
    resultCount: signalSourceRecords.length,
    durationMs: Date.now() - signalSubjectStartedAt,
  });

  const subjectTimelines = signalSubjectIds.length
    ? await tracedFind<OperationalSubjectTimeline>('signal-subject-timelines', 'subject_timelines', { ...scope, subjectId: { $in: signalSubjectIds } }, 250)
    : [];
  if (!signalSubjectIds.length) traces.push({ id: 'signal-subject-timelines', source: 'mongodb', collection: 'subject_timelines', operation: 'find', predicate: { ...scope, reason: 'no-signal-subjects' }, status: 'skipped', resultCount: 0, durationMs: 0 });

  const outsideCandidateSourceIds = values(laboratoryEndpoints
    .filter((item) => (item.referenceRange?.outsideRangeCount || 0) > 0)
    .flatMap((item) => item.sourceRecordIds));
  const resultNumber = { $convert: { input: '$data.LBSTRESN', to: 'double', onError: null, onNull: null } };
  const lowerLimit = { $convert: { input: '$data.LBSTNRLO', to: 'double', onError: null, onNull: null } };
  const upperLimit = { $convert: { input: '$data.LBSTNRHI', to: 'double', onError: null, onNull: null } };
  const abnormalityPredicate = {
    studyId,
    snapshotId,
    domain: 'LB',
    sourceId: { $in: outsideCandidateSourceIds },
    $or: [
      { 'data.LBNRIND': { $in: ['HIGH', 'LOW', 'ABNORMAL', 'H', 'L', 'ABN', 'A'] } },
      { $expr: { $or: [
        { $and: [{ $ne: [resultNumber, null] }, { $ne: [lowerLimit, null] }, { $lt: [resultNumber, lowerLimit] }] },
        { $and: [{ $ne: [resultNumber, null] }, { $ne: [upperLimit, null] }, { $gt: [resultNumber, upperLimit] }] },
      ] } },
    ],
  };
  const abnormalityRecords = outsideCandidateSourceIds.length
    ? await tracedFind<LaboratoryAbnormalityRecord>('laboratory-abnormalities', 'cdisc_records', abnormalityPredicate, 5000)
    : [];
  if (!outsideCandidateSourceIds.length) traces.push({ id: 'laboratory-abnormalities', source: 'mongodb', collection: 'cdisc_records', operation: 'find', predicate: { studyId, snapshotId, domain: 'LB', reason: 'no-outside-range-endpoint-candidates' }, status: 'skipped', resultCount: 0, durationMs: 0 });
  const abnormalitySummary = summarizeLaboratoryAbnormalities(abnormalityRecords, signalSubjectIds);
  const laboratoryAbnormalities = abnormalitySummary.summaries;
  const outsideRangeResultCount = laboratoryAbnormalities.reduce((sum, item) => sum + item.outsideRangeResults, 0);
  const signalSubjectCount = abnormalitySummary.selectedSignalSubjectCount;
  const laboratoryCoverage = {
    ...coverage,
    outsideRangeResultCount,
    signalSubjectCount,
    interpretation: coverage.sourceRangeSummaryCount
      ? `${coverage.sourceRangeSummaryCount} laboratory summaries carry source-supplied reference ranges; ${outsideRangeResultCount} source rows fall outside a supplied limit or carry an abnormality flag. ${signalSubjectCount} animals in the selected pathology signal also appear among those abnormal-result subjects.`
      : `${coverage.endpointSummaryCount} laboratory summaries are available, but this public SEND package does not supply reference intervals or abnormality flags. The application therefore does not invent normal limits.`,
  };

  const allSeries = [...targetSeries, ...bodyWeightSeries, ...foodConsumptionSeries, ...exposureSeries];
  const domainCounts: Record<string, number> = {};
  for (const item of [...endpointSummaries, ...measurementEndpoints, ...clinicalObservations]) domainCounts[item.domain] = (domainCounts[item.domain] || 0) + 1;
  for (const timeline of subjectTimelines) for (const [domain, count] of Object.entries(timeline.domainCounts || {})) domainCounts[domain] = (domainCounts[domain] || 0) + count;
  const sourceRecordCitations = new Set([
    ...endpointSummaries.flatMap((item) => item.sourceRecordIds || []),
    ...measurementEndpoints.flatMap((item) => item.sourceRecordIds || []),
    ...clinicalObservations.flatMap((item) => item.sourceRecordIds || []),
    ...allSeries.flatMap((item) => item.sourceRecordIds || []),
    ...subjectTimelines.flatMap((item) => item.sourceRecordIds || []),
    ...relationships.flatMap((item) => item.sourceRecordIds || []),
  ]).size;
  return {
    available: endpointSummaries.length > 0 || allSeries.length > 0,
    studyId,
    snapshotId,
    signalId: signal.id,
    organ: signal.organ,
    semanticReleaseId,
    targetOrgan: { endpointSummaries, measurementSeries: targetSeries },
    systemicContext: { bodyWeightSeries, foodConsumptionSeries, exposureSeries, measurementEndpoints, clinicalObservations, subjectTimelines, laboratoryCoverage, laboratoryAbnormalities },
    relationships,
    filters: {
      sexes: values([...endpointSummaries.map((item) => item.sex), ...measurementEndpoints.map((item) => item.sex), ...allSeries.map((item) => item.sex), ...subjectTimelines.map((item) => item.sex)]),
      phases: values([...endpointSummaries.map((item) => item.phase), ...measurementEndpoints.map((item) => item.phase), ...allSeries.map((item) => item.phase), ...subjectTimelines.flatMap((item) => item.events.map((event) => event.phase))]),
    },
    inventory: {
      endpointSummaries: endpointSummaries.length,
      measurementSeries: allSeries.length,
      sourceDeclaredRelationships: relationships.length,
      sourceRecordCitations,
      domainCounts,
    },
    execution: {
      resolverId: resolver.id,
      capabilityId: resolver.capability,
      executor: resolver.executor,
      policies: resolver.policy,
      declaredStages: resolver.stages,
      containmentPlan: resolver.containmentPlan,
      dataOperations: traces,
      executedAt: new Date().toISOString(),
    },
  };
}
