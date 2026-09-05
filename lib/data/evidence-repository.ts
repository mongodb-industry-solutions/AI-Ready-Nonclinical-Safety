import type { CanonicalEvidenceRecord, SafetySignal, SignalRecordEvidence } from '@/lib/contracts';
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
    counts: { findings: 0, laboratory: 0, subjects: 0, artifacts: 0 },
  } satisfies SignalRecordEvidence;
  if (!database) return empty;

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
  const findingRecords = await records.find({
    studyId,
    snapshotId,
    domain: 'MI',
    ...findingFilter,
  }, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).limit(200).toArray();

  if (!findingRecords.length) return empty;
  const subjectIds = [...new Set(findingRecords.map((record) => String(record.facets?.subjectId || record.data?.USUBJID || '')).filter(Boolean))];
  const subjectScope = { studyId, snapshotId, 'facets.subjectId': { $in: subjectIds } };
  const [demographics, laboratory, treatment, artifacts, snapshot] = await Promise.all([
    records.find({ ...subjectScope, domain: 'DM' }, { projection: { _id: 0 } }).toArray(),
    signal.correlatedLab
      ? records.find({ ...subjectScope, domain: 'LB', $or: [{ 'facets.testCode': signal.correlatedLab }, { 'data.LBTESTCD': signal.correlatedLab }] }, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).limit(500).toArray()
      : Promise.resolve([]),
    records.find({ studyId, snapshotId, domain: 'TX' }, { projection: { _id: 0 } }).sort({ rowOrdinal: 1 }).limit(100).toArray(),
    database.collection('source_artifacts').find(
      { studyId, snapshotId },
      { projection: { _id: 0, sourceId: 1, sourceName: 1, mediaType: 1, size: 1, digest: 1 } },
    ).sort({ sourceName: 1 }).toArray(),
    database.collection('study_snapshots').findOne(
      { studyId, snapshotId },
      { projection: { _id: 0, evidencePackageId: 1, modelSchemaVersion: 1 } },
    ),
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
        demographicRecord: demographicRecord ? publicRecord(demographicRecord) : undefined,
        findingRecords: findingRecords.filter((record) => String(record.facets?.subjectId || record.data?.USUBJID) === subjectId).map(publicRecord),
        laboratoryRecords: laboratory.filter((record) => String(record.facets?.subjectId || record.data?.USUBJID) === subjectId).map(publicRecord),
      };
    }),
    treatmentRecords: treatment.map(publicRecord),
    sourceArtifacts: artifacts as unknown as SignalRecordEvidence['sourceArtifacts'],
    counts: { findings: findingRecords.length, laboratory: laboratory.length, subjects: subjectIds.length, artifacts: artifacts.length },
  };
}
