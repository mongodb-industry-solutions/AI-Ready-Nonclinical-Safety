import type { CanonicalEvidenceRecord, CanonicalRecordPage, DataQueryTrace, SafetySignal, SignalRecordEvidence } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';
import { summarizeMongoExplain } from '@/lib/data/mongodb-explain';

type StoredRecord = {
  _id: string;
  canonical: {
    domain: string;
    rowOrdinal: number;
    recordKey: Record<string, unknown>;
    data: Record<string, unknown>;
  };
  _control: {
    tenantId: string;
    studyId: string;
    snapshotId: string;
    evidencePackageId: string;
  };
  _index: { facets?: Record<string, unknown> };
  _provenance: {
    sourceArtifactId?: string;
    sourceDatasetId: string;
    sourceRow: number;
    recordHash: string;
  };
};

type DatasetDefinition = {
  domain: string;
  recordCount: number;
};

type SubjectTimelineInventory = {
  subjectId: string;
  domainCounts: Record<string, number>;
};

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicRecord(record: StoredRecord): CanonicalEvidenceRecord {
  return {
    sourceId: record._id,
    domain: record.canonical.domain,
    rowOrdinal: record.canonical.rowOrdinal,
    recordKey: record.canonical.recordKey,
    facets: record._index.facets || {},
    data: record.canonical.data,
    lineage: {
      sourceArtifactId: record._provenance.sourceArtifactId,
      sourceDataset: record._provenance.sourceDatasetId,
      sourceRow: record._provenance.sourceRow,
      recordHash: record._provenance.recordHash,
    },
  };
}

export async function loadSignalRecordEvidence(
  studyId: string,
  snapshotId: string,
  signal: SafetySignal,
  onQuery?: (trace: DataQueryTrace) => void,
): Promise<SignalRecordEvidence> {
  const database = await solutionDatabase();
  const empty = {
    available: false,
    studyId,
    snapshotId,
    signalId: signal.id,
    subjects: [],
    treatmentRecords: [],
    sourceArtifacts: [],
    domainInventory: [],
    counts: { findings: 0, laboratory: 0, subjects: 0, artifacts: 0 },
  } satisfies SignalRecordEvidence;
  if (!database) {
    onQuery?.({ id: 'canonical-evidence', source: 'portable-bundle', collection: 'cdisc_records', operation: 'fixture-read', predicate: { studyId, snapshotId, signalId: signal.id }, status: 'fallback', resultCount: 0, durationMs: 0 });
    return empty;
  }

  const records = database.collection<StoredRecord>('cdisc_records');
  const evidenceScope = {
    '_control.tenantId': process.env.CDISC_TENANT_ID || 'public-demo',
    '_control.studyId': studyId,
    '_control.snapshotId': snapshotId,
  };
  const findingFilter = signal.sourceRecordIds?.length
    ? { _id: { $in: signal.sourceRecordIds } }
    : (() => {
      const organ = new RegExp(escaped(signal.organ), 'i');
      const findingWords = signal.finding.split(/[, /]+/).filter((word) => word.length > 3).slice(0, 2);
      const finding = new RegExp(findingWords.map(escaped).join('.*'), 'i');
      return {
        $and: [
          { $or: [{ '_index.facets.organ': organ }, { '_index.facets.specimen': organ }, { 'canonical.data.MISPEC': organ }, { 'canonical.data.MIORRES': organ }] },
          { $or: [{ '_index.facets.finding': finding }, { '_index.facets.resultCharacter': finding }, { 'canonical.data.MISTRESC': finding }, { 'canonical.data.MIORRES': finding }, { 'canonical.data.MITEST': finding }] },
        ],
      };
    })();
  const findingPredicate = {
    ...evidenceScope,
    'canonical.domain': 'MI',
    ...findingFilter,
  };
  const findingStartedAt = Date.now();
  const findingRecords = await records.find(findingPredicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).limit(200).toArray();
  const findingDurationMs = Date.now() - findingStartedAt;
  let findingPlan: DataQueryTrace['plan'];
  if (onQuery) {
    try {
      findingPlan = summarizeMongoExplain(await records.find(findingPredicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).limit(200).explain('executionStats'), findingRecords.length);
    } catch {
      // Evidence retrieval does not depend on explain privileges.
    }
  }
  onQuery?.({ id: 'finding-records', source: 'mongodb', collection: 'cdisc_records', operation: 'find', predicate: findingPredicate, status: 'executed', resultCount: findingRecords.length, durationMs: findingDurationMs, ...(findingPlan ? { plan: findingPlan } : {}) });

  if (!findingRecords.length) return empty;
  const subjectIds = [...new Set(findingRecords.map((record) => String(record._index.facets?.subjectId || record.canonical.data.USUBJID || '')).filter(Boolean))];
  const subjectScope = {
    ...evidenceScope,
    '_index.facets.subjectId': { $in: subjectIds },
  };
  async function tracedRead<T>(id: string, collection: string, operation: 'find' | 'findOne' | 'aggregate', predicate: Record<string, unknown>, run: () => Promise<T>, count: (value: T) => number, explain?: () => Promise<unknown>): Promise<T> {
    const startedAt = Date.now();
    const value = await run();
    const durationMs = Date.now() - startedAt;
    const resultCount = count(value);
    let plan: DataQueryTrace['plan'];
    if (onQuery && explain) {
      try {
        plan = summarizeMongoExplain(await explain(), resultCount);
      } catch {
        // Evidence retrieval does not depend on explain privileges.
      }
    }
    onQuery?.({ id, source: 'mongodb', collection, operation, predicate, status: 'executed', resultCount, durationMs, ...(plan ? { plan } : {}) });
    return value;
  }
  const subjectPredicate = { studyId, snapshotId, subjectIds };
  const demographicsPredicate = { ...subjectScope, 'canonical.domain': 'DM' };
  const laboratoryPredicate = { ...subjectScope, 'canonical.domain': 'LB', $or: [{ '_index.facets.testCode': signal.correlatedLab }, { 'canonical.data.LBTESTCD': signal.correlatedLab }] };
  const treatmentPredicate = { ...evidenceScope, 'canonical.domain': 'TX' };
  const artifactPredicate = { studyId, snapshotId };
  const studyDomainPredicate = { studyId, snapshotId };
  const subjectTimelinePredicate = { studyId, snapshotId, subjectId: { $in: subjectIds } };
  const [demographics, laboratory, treatment, artifacts, snapshot, studyDomainCounts, subjectDomainCounts] = await Promise.all([
    tracedRead('subject-demographics', 'cdisc_records', 'find', demographicsPredicate, () => records.find(demographicsPredicate, { projection: { _enrichment: 0 } }).toArray(), (rows) => rows.length, () => records.find(demographicsPredicate, { projection: { _enrichment: 0 } }).explain('executionStats')),
    signal.correlatedLab
      ? tracedRead('correlated-laboratory', 'cdisc_records', 'find', laboratoryPredicate, () => records.find(laboratoryPredicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).limit(500).toArray(), (rows) => rows.length, () => records.find(laboratoryPredicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).limit(500).explain('executionStats'))
      : Promise.resolve([]),
    tracedRead('treatment-definitions', 'cdisc_records', 'find', treatmentPredicate, () => records.find(treatmentPredicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).limit(100).toArray(), (rows) => rows.length, () => records.find(treatmentPredicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).limit(100).explain('executionStats')),
    tracedRead('source-artifacts', 'source_artifacts', 'find', artifactPredicate, () => database.collection('source_artifacts').find(
      artifactPredicate,
      { projection: { _id: 0, sourceId: 1, sourceName: 1, mediaType: 1, size: 1, digest: 1 } },
    ).sort({ sourceName: 1 }).toArray(), (rows) => rows.length, () => database.collection('source_artifacts').find(artifactPredicate, { projection: { _id: 0, sourceId: 1, sourceName: 1, mediaType: 1, size: 1, digest: 1 } }).sort({ sourceName: 1 }).explain('executionStats')),
    tracedRead('snapshot-metadata', 'study_snapshots', 'findOne', artifactPredicate, () => database.collection('study_snapshots').findOne(
      artifactPredicate,
      { projection: { _id: 0, evidencePackageId: 1, modelSchemaVersion: 1 } },
    ), (row) => row ? 1 : 0, () => database.collection('study_snapshots').find(artifactPredicate, { projection: { _id: 0, evidencePackageId: 1, modelSchemaVersion: 1 } }).limit(1).explain('executionStats')),
    tracedRead('study-domain-inventory', 'dataset_definitions', 'find', studyDomainPredicate, () => database.collection<DatasetDefinition>('dataset_definitions').find(studyDomainPredicate, { projection: { _id: 0, domain: 1, recordCount: 1 } }).sort({ domain: 1 }).toArray(), (rows) => rows.length, () => database.collection<DatasetDefinition>('dataset_definitions').find(studyDomainPredicate, { projection: { _id: 0, domain: 1, recordCount: 1 } }).sort({ domain: 1 }).explain('executionStats')),
    tracedRead('subject-domain-inventory', 'subject_timelines', 'find', { ...subjectPredicate, projection: 'domainCounts' }, () => database.collection<SubjectTimelineInventory>('subject_timelines').find(subjectTimelinePredicate, { projection: { _id: 0, subjectId: 1, domainCounts: 1 } }).sort({ subjectId: 1 }).toArray(), (rows) => rows.length, () => database.collection<SubjectTimelineInventory>('subject_timelines').find(subjectTimelinePredicate, { projection: { _id: 0, subjectId: 1, domainCounts: 1 } }).sort({ subjectId: 1 }).explain('executionStats')),
  ]);

  const bySubject = new Map(demographics.map((record) => [String(record._index.facets?.subjectId || record.canonical.data.USUBJID), record]));
  return {
    available: true,
    studyId,
    snapshotId,
    signalId: signal.id,
    packageId: snapshot?.evidencePackageId as string | undefined,
    modelSchemaVersion: snapshot?.modelSchemaVersion as string | undefined,
    subjects: subjectIds.map((subjectId) => {
      const demographicRecord = bySubject.get(subjectId);
      return {
        subjectId,
        treatmentGroup: String(demographicRecord?._index.facets?.treatmentGroup || demographicRecord?.canonical.data.SPGRPCD || ''),
        domainCounts: subjectDomainCounts.find((item) => item.subjectId === subjectId)?.domainCounts || {},
        demographicRecord: demographicRecord ? publicRecord(demographicRecord) : undefined,
        findingRecords: findingRecords.filter((record) => String(record._index.facets?.subjectId || record.canonical.data.USUBJID) === subjectId).map(publicRecord),
        laboratoryRecords: laboratory.filter((record) => String(record._index.facets?.subjectId || record.canonical.data.USUBJID) === subjectId).map(publicRecord),
      };
    }),
    treatmentRecords: treatment.map(publicRecord),
    sourceArtifacts: artifacts as unknown as SignalRecordEvidence['sourceArtifacts'],
    domainInventory: studyDomainCounts.map((item) => ({
      domain: item.domain,
      studyRecords: item.recordCount,
    })),
    counts: { findings: findingRecords.length, laboratory: laboratory.length, subjects: subjectIds.length, artifacts: artifacts.length },
  };
}

export async function loadCanonicalRecordPage(
  studyId: string,
  snapshotId: string,
  options: { domain: string; scope: 'subject' | 'study'; subjectId?: string; filter: CanonicalRecordPage['filter']; linkedTestCode?: string; testCode?: string; sourceRecordIds?: string[]; offset: number; limit: number },
): Promise<CanonicalRecordPage> {
  const database = await solutionDatabase();
  const base = {
    available: false,
    studyId,
    snapshotId,
    scope: options.scope,
    ...(options.subjectId ? { subjectId: options.subjectId } : {}),
    domain: options.domain,
    filter: options.filter,
    offset: options.offset,
    limit: options.limit,
    total: 0,
    records: [],
  } satisfies CanonicalRecordPage;
  if (!database) return base;

  const scopePredicate: Record<string, unknown> = {
    '_control.tenantId': process.env.CDISC_TENANT_ID || 'public-demo',
    '_control.studyId': studyId,
    '_control.snapshotId': snapshotId,
    'canonical.domain': options.domain,
  };
  if (options.scope === 'subject') {
    if (!options.subjectId) return base;
    scopePredicate.$or = [
      { '_index.facets.subjectId': options.subjectId },
      { 'canonical.data.USUBJID': options.subjectId },
      { 'canonical.data.SUBJID': options.subjectId },
    ];
  }
  const resultNumber = { $convert: { input: '$canonical.data.LBSTRESN', to: 'double', onError: null, onNull: null } };
  const lowerLimit = { $convert: { input: '$canonical.data.LBSTNRLO', to: 'double', onError: null, onNull: null } };
  const upperLimit = { $convert: { input: '$canonical.data.LBSTNRHI', to: 'double', onError: null, onNull: null } };
  const sourceAbnormal = { 'canonical.data.LBNRIND': { $in: ['HIGH', 'LOW', 'ABNORMAL', 'H', 'L', 'ABN', 'A'] } };
  const referenceRangePresent = { $or: [{ 'canonical.data.LBSTNRLO': { $exists: true, $nin: [null, ''] } }, { 'canonical.data.LBSTNRHI': { $exists: true, $nin: [null, ''] } }] };
  const outsideRange = {
    $or: [
      sourceAbnormal,
      { $expr: { $or: [
        { $and: [{ $ne: [resultNumber, null] }, { $ne: [lowerLimit, null] }, { $lt: [resultNumber, lowerLimit] }] },
        { $and: [{ $ne: [resultNumber, null] }, { $ne: [upperLimit, null] }, { $gt: [resultNumber, upperLimit] }] },
      ] } },
    ],
  };
  let filterPredicate: Record<string, unknown> | undefined;
  if (options.domain === 'LB' && options.filter === 'outside-range') filterPredicate = outsideRange;
  if (options.domain === 'LB' && options.filter === 'unassessed') filterPredicate = { $nor: [sourceAbnormal, referenceRangePresent] };
  if (options.domain === 'LB' && options.filter === 'linked-test' && options.linkedTestCode) filterPredicate = {
    $or: [{ '_index.facets.testCode': options.linkedTestCode }, { 'canonical.data.LBTESTCD': options.linkedTestCode }],
  };
  const sourcePredicate = options.sourceRecordIds?.length ? { _id: { $in: options.sourceRecordIds } } : undefined;
  const testPredicate = options.testCode
    ? { $or: [{ '_index.facets.testCode': options.testCode }, { [`canonical.data.${options.domain}TESTCD`]: options.testCode }] }
    : undefined;
  const constraints = [scopePredicate, filterPredicate, testPredicate, sourcePredicate].filter((item): item is Record<string, unknown> => Boolean(item));
  const predicate = constraints.length > 1 ? { $and: constraints } : constraints[0];
  const collection = database.collection<StoredRecord>('cdisc_records');
  const startedAt = Date.now();
  const [total, rows] = await Promise.all([
    collection.countDocuments(predicate),
    collection.find(predicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).skip(options.offset).limit(options.limit).toArray(),
  ]);
  let plan: DataQueryTrace['plan'];
  try {
    plan = summarizeMongoExplain(await collection.find(predicate, { projection: { _enrichment: 0 } }).sort({ 'canonical.rowOrdinal': 1 }).skip(options.offset).limit(options.limit).explain('executionStats'), rows.length);
  } catch {
    // The canonical rows remain available when the connected role cannot explain.
  }
  return {
    ...base,
    available: true,
    total,
    records: rows.map(publicRecord),
    execution: {
      id: 'canonical-source-drilldown',
      source: 'mongodb',
      collection: 'cdisc_records',
      operation: 'find',
      predicate,
      status: 'executed',
      resultCount: rows.length,
      durationMs: Date.now() - startedAt,
      ...(plan ? { plan } : {}),
    },
  };
}
