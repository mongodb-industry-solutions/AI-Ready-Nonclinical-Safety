import type { CanonicalEvidenceRecord, CanonicalRecordPage, DataQueryTrace, SafetySignal, SignalRecordEvidence } from '@/lib/contracts';
import { solutionDatabase } from '@/lib/data/mongodb';

type StoredRecord = CanonicalEvidenceRecord & {
  studyId: string;
  snapshotId: string;
  evidencePackageId?: string;
};

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicRecord(record: StoredRecord): CanonicalEvidenceRecord {
  return {
    sourceId: record.sourceId,
    domain: record.domain,
    rowOrdinal: record.rowOrdinal,
    recordKey: record.recordKey || {},
    facets: record.facets || {},
    data: record.data || {},
    lineage: record.lineage,
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
  const findingFilter = signal.sourceRecordIds?.length
    ? { sourceId: { $in: signal.sourceRecordIds } }
    : (() => {
      const organ = new RegExp(escaped(signal.organ), 'i');
      const findingWords = signal.finding.split(/[, /]+/).filter((word) => word.length > 3).slice(0, 2);
      const finding = new RegExp(findingWords.map(escaped).join('.*'), 'i');
      return {
        $and: [
          { $or: [{ 'facets.organ': organ }, { 'facets.specimen': organ }, { 'data.MISPEC': organ }, { 'data.MIORRES': organ }] },
          { $or: [{ 'facets.finding': finding }, { 'facets.resultCharacter': finding }, { 'data.MISTRESC': finding }, { 'data.MIORRES': finding }, { 'data.MITEST': finding }] },
        ],
      };
    })();
  const findingStartedAt = Date.now();
  const findingRecords = await records.find({
    studyId,
    snapshotId,
    domain: 'MI',
    ...findingFilter,
  }, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).limit(200).toArray();
  onQuery?.({ id: 'finding-records', source: 'mongodb', collection: 'cdisc_records', operation: 'find', predicate: { studyId, snapshotId, domain: 'MI', signalId: signal.id }, status: 'executed', resultCount: findingRecords.length, durationMs: Date.now() - findingStartedAt });

  if (!findingRecords.length) return empty;
  const subjectIds = [...new Set(findingRecords.map((record) => String(record.facets?.subjectId || record.data?.USUBJID || '')).filter(Boolean))];
  const subjectScope = {
    studyId,
    snapshotId,
    $or: [
      { 'facets.subjectId': { $in: subjectIds } },
      { 'data.USUBJID': { $in: subjectIds } },
      { 'data.SUBJID': { $in: subjectIds } },
    ],
  };
  async function tracedRead<T>(id: string, collection: string, operation: 'find' | 'findOne', predicate: Record<string, unknown>, run: () => Promise<T>, count: (value: T) => number): Promise<T> {
    const startedAt = Date.now();
    const value = await run();
    onQuery?.({ id, source: 'mongodb', collection, operation, predicate, status: 'executed', resultCount: count(value), durationMs: Date.now() - startedAt });
    return value;
  }
  const subjectPredicate = { studyId, snapshotId, subjectIds };
  const [demographics, laboratory, treatment, artifacts, snapshot, studyDomainCounts, subjectDomainCounts] = await Promise.all([
    tracedRead('subject-demographics', 'cdisc_records', 'find', { ...subjectPredicate, domain: 'DM' }, () => records.find({ ...subjectScope, domain: 'DM' }, { projection: { _id: 0 } }).toArray(), (rows) => rows.length),
    signal.correlatedLab
      ? tracedRead('correlated-laboratory', 'cdisc_records', 'find', { ...subjectPredicate, domain: 'LB', testCode: signal.correlatedLab }, () => records.find({ ...subjectScope, domain: 'LB', $or: [{ 'facets.testCode': signal.correlatedLab }, { 'data.LBTESTCD': signal.correlatedLab }] }, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).limit(500).toArray(), (rows) => rows.length)
      : Promise.resolve([]),
    tracedRead('treatment-definitions', 'cdisc_records', 'find', { studyId, snapshotId, domain: 'TX' }, () => records.find({ studyId, snapshotId, domain: 'TX' }, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).limit(100).toArray(), (rows) => rows.length),
    tracedRead('source-artifacts', 'source_artifacts', 'find', { studyId, snapshotId }, () => database.collection('source_artifacts').find(
      { studyId, snapshotId },
      { projection: { _id: 0, sourceId: 1, sourceName: 1, mediaType: 1, size: 1, digest: 1 } },
    ).sort({ sourceName: 1 }).toArray(), (rows) => rows.length),
    tracedRead('snapshot-metadata', 'study_snapshots', 'findOne', { studyId, snapshotId }, () => database.collection('study_snapshots').findOne(
      { studyId, snapshotId },
      { projection: { _id: 0, evidencePackageId: 1, modelSchemaVersion: 1 } },
    ), (row) => row ? 1 : 0),
    records.aggregate<{ _id: string; count: number }>([
      { $match: { studyId, snapshotId } },
      { $group: { _id: '$domain', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    records.aggregate<{ _id: { subjectId: string; domain: string }; count: number }>([
      { $match: subjectScope },
      { $group: { _id: { subjectId: { $ifNull: ['$facets.subjectId', { $ifNull: ['$data.USUBJID', '$data.SUBJID'] }] }, domain: '$domain' }, count: { $sum: 1 } } },
      { $sort: { '_id.subjectId': 1, '_id.domain': 1 } },
    ]).toArray(),
  ]);

  const bySubject = new Map(demographics.map((record) => [String(record.facets?.subjectId || record.data?.USUBJID), record]));
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
        treatmentGroup: String(demographicRecord?.facets?.treatmentGroup || demographicRecord?.data?.SPGRPCD || ''),
        domainCounts: Object.fromEntries(subjectDomainCounts.filter((item) => item._id.subjectId === subjectId).map((item) => [item._id.domain, item.count])),
        demographicRecord: demographicRecord ? publicRecord(demographicRecord) : undefined,
        findingRecords: findingRecords.filter((record) => String(record.facets?.subjectId || record.data?.USUBJID) === subjectId).map(publicRecord),
        laboratoryRecords: laboratory.filter((record) => String(record.facets?.subjectId || record.data?.USUBJID) === subjectId).map(publicRecord),
      };
    }),
    treatmentRecords: treatment.map(publicRecord),
    sourceArtifacts: artifacts as unknown as SignalRecordEvidence['sourceArtifacts'],
    domainInventory: studyDomainCounts.map((item) => ({
      domain: item._id,
      studyRecords: item.count,
    })),
    counts: { findings: findingRecords.length, laboratory: laboratory.length, subjects: subjectIds.length, artifacts: artifacts.length },
  };
}

export async function loadCanonicalRecordPage(
  studyId: string,
  snapshotId: string,
  options: { domain: string; scope: 'subject' | 'study'; subjectId?: string; filter: CanonicalRecordPage['filter']; linkedTestCode?: string; offset: number; limit: number },
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

  const scopePredicate: Record<string, unknown> = { studyId, snapshotId, domain: options.domain };
  if (options.scope === 'subject') {
    if (!options.subjectId) return base;
    scopePredicate.$or = [
      { 'facets.subjectId': options.subjectId },
      { 'data.USUBJID': options.subjectId },
      { 'data.SUBJID': options.subjectId },
    ];
  }
  const resultNumber = { $convert: { input: '$data.LBSTRESN', to: 'double', onError: null, onNull: null } };
  const lowerLimit = { $convert: { input: '$data.LBSTNRLO', to: 'double', onError: null, onNull: null } };
  const upperLimit = { $convert: { input: '$data.LBSTNRHI', to: 'double', onError: null, onNull: null } };
  const sourceAbnormal = { 'data.LBNRIND': { $in: ['HIGH', 'LOW', 'ABNORMAL', 'H', 'L', 'ABN', 'A'] } };
  const referenceRangePresent = { $or: [{ 'data.LBSTNRLO': { $exists: true, $nin: [null, ''] } }, { 'data.LBSTNRHI': { $exists: true, $nin: [null, ''] } }] };
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
    $or: [{ 'facets.testCode': options.linkedTestCode }, { 'data.LBTESTCD': options.linkedTestCode }],
  };
  const predicate = filterPredicate ? { $and: [scopePredicate, filterPredicate] } : scopePredicate;
  const collection = database.collection<StoredRecord>('cdisc_records');
  const [total, rows] = await Promise.all([
    collection.countDocuments(predicate),
    collection.find(predicate, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).skip(options.offset).limit(options.limit).toArray(),
  ]);
  return { ...base, available: true, total, records: rows.map(publicRecord) };
}
