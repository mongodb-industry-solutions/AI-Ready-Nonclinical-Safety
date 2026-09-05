import type {
  BiologicalCoherenceResponse,
  DataQueryTrace,
  EndpointSummary,
  OperationalEvidenceRelationship,
  OperationalMeasurementSeries,
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
      exposureSeries: [],
      laboratoryCoverage: {
        endpointSummaryCount: 0,
        sourceRangeSummaryCount: 0,
        outsideRangeSummaryCount: 0,
        interpretation: 'Operational evidence projections are not available in portable mode.',
      },
    },
    relationships: [],
    filters: { sexes: [], phases: [] },
    inventory: { endpointSummaries: 0, measurementSeries: 0, sourceDeclaredRelationships: 0, sourceRecordCitations: 0 },
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
  const exposurePredicate = { ...scope, domain: { $in: ['PC', 'PP'] } };
  const relationshipPredicate = signal.sourceRecordIds?.length
    ? { ...scope, authority: 'source-declared', sourceRecordIds: { $in: signal.sourceRecordIds } }
    : { ...scope, authority: 'source-declared', subjectId: { $exists: true } };

  const [endpointSummaries, targetSeries, bodyWeightSeries, exposureSeries, relationships] = await Promise.all([
    tracedFind<EndpointSummary>('target-organ-endpoints', 'study_endpoint_summaries', targetEndpointPredicate, 500),
    tracedFind<OperationalMeasurementSeries>('target-organ-measurements', 'measurement_series', targetSeriesPredicate, 100),
    tracedFind<OperationalMeasurementSeries>('body-weight-series', 'measurement_series', bodyWeightPredicate, 100),
    tracedFind<OperationalMeasurementSeries>('systemic-exposure-series', 'measurement_series', exposurePredicate, 100),
    tracedFind<OperationalEvidenceRelationship>('source-declared-relationships', 'evidence_relationships', relationshipPredicate, 100),
  ]);

  const laboratoryStartedAt = Date.now();
  const laboratoryPipeline = [
    { $match: { ...scope, domain: 'LB' } },
    { $group: {
      _id: null,
      endpointSummaryCount: { $sum: 1 },
      sourceRangeSummaryCount: { $sum: { $cond: [{ $eq: ['$referenceRange.status', 'source-supplied'] }, 1, 0] } },
      outsideRangeSummaryCount: { $sum: { $cond: [{ $gt: ['$referenceRange.outsideRangeCount', 0] }, 1, 0] } },
    } },
    { $project: { _id: 0 } },
  ];
  const laboratoryCollection = db.collection('study_endpoint_summaries');
  const laboratoryResult = await laboratoryCollection.aggregate<{
    endpointSummaryCount: number;
    sourceRangeSummaryCount: number;
    outsideRangeSummaryCount: number;
  }>(laboratoryPipeline).toArray();
  let laboratoryPlan: DataQueryTrace['plan'];
  try {
    laboratoryPlan = summarizeMongoExplain(await laboratoryCollection.aggregate(laboratoryPipeline).explain('executionStats'), laboratoryResult.length);
  } catch {
    // Query results remain usable when the connected role cannot run explain.
  }
  traces.push({
    id: 'laboratory-reference-coverage',
    source: 'mongodb',
    collection: 'study_endpoint_summaries',
    operation: 'aggregate',
    predicate: { ...scope, domain: 'LB', group: 'referenceRange.status' },
    status: 'executed',
    resultCount: laboratoryResult.length,
    durationMs: Date.now() - laboratoryStartedAt,
    ...(laboratoryPlan ? { plan: laboratoryPlan } : {}),
  });
  const coverage = laboratoryResult[0] || { endpointSummaryCount: 0, sourceRangeSummaryCount: 0, outsideRangeSummaryCount: 0 };
  const laboratoryCoverage = {
    ...coverage,
    interpretation: coverage.sourceRangeSummaryCount
      ? `${coverage.sourceRangeSummaryCount} laboratory summaries carry source-supplied reference ranges; ${coverage.outsideRangeSummaryCount} contain at least one source-flagged or calculated outside-range result.`
      : `${coverage.endpointSummaryCount} laboratory summaries are available, but this public SEND package does not supply reference intervals or abnormality flags. The application therefore does not invent normal limits.`,
  };

  const allSeries = [...targetSeries, ...bodyWeightSeries, ...exposureSeries];
  const sourceRecordCitations = new Set([
    ...endpointSummaries.flatMap((item) => item.sourceRecordIds || []),
    ...allSeries.flatMap((item) => item.sourceRecordIds || []),
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
    systemicContext: { bodyWeightSeries, exposureSeries, laboratoryCoverage },
    relationships,
    filters: {
      sexes: values([...endpointSummaries.map((item) => item.sex), ...allSeries.map((item) => item.sex)]),
      phases: values([...endpointSummaries.map((item) => item.phase), ...allSeries.map((item) => item.phase)]),
    },
    inventory: {
      endpointSummaries: endpointSummaries.length,
      measurementSeries: allSeries.length,
      sourceDeclaredRelationships: relationships.length,
      sourceRecordCitations,
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
