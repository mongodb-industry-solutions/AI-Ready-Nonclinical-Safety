'use client';

import { useEffect, useState } from 'react';
import { Database, FileCheck2, Fingerprint, LoaderCircle, Microscope } from 'lucide-react';
import type { SafetySignal, SignalRecordEvidence, StudySummary } from '@/lib/contracts';

function value(record: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const item = record?.[key];
    if (item !== undefined && item !== null && item !== '') return String(item);
  }
  return '—';
}

export default function RecordEvidencePanel({ study, signal }: { study: StudySummary; signal: SafetySignal }) {
  const [result, setResult] = useState<SignalRecordEvidence | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSelected(0);
    fetch(`/api/studies/${encodeURIComponent(study.id)}/signals/${encodeURIComponent(signal.id)}/records`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Record evidence could not be loaded');
        return response.json();
      })
      .then(setResult)
      .catch(() => { if (!controller.signal.aborted) setResult(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [signal.id, study.id]);

  if (loading) return <div className="record-evidence-state"><LoaderCircle className="spin" size={18} /><span><b>Resolving source records</b><small>Following MI → animal → DM / LB → immutable artifact</small></span></div>;
  if (!result?.available) return <div className="record-evidence-state empty"><Database size={18} /><span><b>Canonical evidence package not imported</b><small>The aggregate demonstration remains available. Import a verified Kehrnel solution-evidence package to activate row-level drilldown.</small></span></div>;

  const subject = result.subjects[selected] || result.subjects[0];
  const finding = subject?.findingRecords[0];
  const demographic = subject?.demographicRecord;
  const labs = subject?.laboratoryRecords || [];
  return <div className="record-evidence-workspace">
    <header>
      <div><span className="panel-kicker">Canonical record drilldown</span><h2>Every visual claim resolves to source rows</h2></div>
      <div className="evidence-package-badge"><FileCheck2 size={13} /><span><b>Verified handoff</b><small>schema {result.modelSchemaVersion} · {result.packageId?.slice(0, 22)}…</small></span></div>
    </header>
    <div className="record-counts"><span><b>{result.counts.subjects}</b> subjects</span><span><b>{result.counts.findings}</b> MI rows</span><span><b>{result.counts.laboratory}</b> LB rows</span><span><b>{result.counts.artifacts}</b> artifacts</span></div>
    <div className="record-evidence-body">
      <aside><span>Supporting animals</span>{result.subjects.map((item, index) => <button key={item.subjectId} className={selected === index ? 'active' : ''} onClick={() => setSelected(index)}><i>{String(index + 1).padStart(2, '0')}</i><span><b>{item.subjectId}</b><small>{item.treatmentGroup || 'group not projected'} · {item.laboratoryRecords.length} lab rows</small></span></button>)}</aside>
      {subject && <main>
        <section className="record-thread-head"><div><Fingerprint size={16} /><span><b>{subject.subjectId}</b><small>{subject.treatmentGroup || 'Treatment group unresolved'}</small></span></div><em>{subject.findingRecords.length} matching finding row{subject.findingRecords.length === 1 ? '' : 's'}</em></section>
        <div className="record-cards">
          <article><header><Database size={13} /><b>DM · identity</b></header><dl><div><dt>Sex</dt><dd>{value(demographic?.data, ['SEX'])}</dd></div><div><dt>Species</dt><dd>{value(demographic?.data, ['SPECIES'])}</dd></div><div><dt>Group</dt><dd>{value(demographic?.data, ['SPGRPCD', 'ARMCD'])}</dd></div></dl><footer>{demographic ? `row ${demographic.lineage.sourceRow} · ${demographic.lineage.recordHash.slice(0, 12)}…` : 'No DM row'}</footer></article>
          <article className="finding-record"><header><Microscope size={13} /><b>MI · finding</b></header><dl><div><dt>Specimen</dt><dd>{value(finding?.data, ['MISPEC', 'MIORRES'])}</dd></div><div><dt>Finding</dt><dd>{value(finding?.data, ['MISTRESC', 'MIORRES', 'MITEST'])}</dd></div><div><dt>Severity</dt><dd>{value(finding?.data, ['MISEV'])}</dd></div></dl><footer>{finding ? `row ${finding.lineage.sourceRow} · ${finding.lineage.recordHash.slice(0, 12)}…` : 'No MI row'}</footer></article>
          <article><header><Database size={13} /><b>LB · longitudinal context</b></header><dl><div><dt>Test</dt><dd>{value(labs[0]?.data, ['LBTESTCD', 'LBTEST'])}</dd></div><div><dt>Rows</dt><dd>{labs.length}</dd></div><div><dt>Days</dt><dd>{[...new Set(labs.map((item) => value(item.data, ['LBDY', 'LBSTDY'])))].slice(0, 6).join(', ') || '—'}</dd></div></dl><footer>{labs[0] ? `first row ${labs[0].lineage.sourceRow} · checksummed` : 'No matching LB rows'}</footer></article>
        </div>
        <div className="artifact-proof"><FileCheck2 size={14} /><span><b>Source proof</b><small>{result.sourceArtifacts.map((item) => `${item.sourceName || 'artifact'} · ${item.digest.value.slice(0, 10)}…`).join('  |  ')}</small></span></div>
      </main>}
    </div>
  </div>;
}
