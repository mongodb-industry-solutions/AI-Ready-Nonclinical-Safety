'use client';

import { useEffect, useState } from 'react';
import { Braces, ChevronLeft, ChevronRight, Database, FileCheck2, Fingerprint, LoaderCircle, Microscope, Rows3 } from 'lucide-react';
import type { CanonicalEvidenceRecord, CanonicalRecordPage, DoseGroup, SafetySignal, SignalRecordEvidence, StudySummary } from '@/lib/contracts';
import type { EvidenceDomain } from '@/components/EvidenceAssembly';

function value(record: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const item = record?.[key];
    if (item !== undefined && item !== null && item !== '') return String(item);
  }
  return '—';
}

const domainFocusCopy: Record<EvidenceDomain, { title: string; detail: string }> = {
  MI: { title: 'Microscopic findings', detail: 'The observation that defines the finding numerator: tissue, morphology, severity and subject.' },
  DM: { title: 'Demographics', detail: 'The subject identity and treatment-group binding used for denominators and joins.' },
  TX: { title: 'Trial sets', detail: 'The governed group definitions that supply dose, unit, vehicle and exposure context.' },
  LB: { title: 'Laboratory tests', detail: 'Longitudinal measurements used as biological context; they do not create the pathology finding.' },
  MA: { title: 'Macroscopic findings', detail: 'Gross pathology observations at necropsy, including specimen and source-declared qualifiers.' },
  OM: { title: 'Organ measurements', detail: 'Absolute and normalized organ measurements linked to subject, group, sex, day and phase.' },
  BW: { title: 'Body weights', detail: 'Longitudinal animal-level body weights used as systemic context.' },
  BG: { title: 'Body-weight gain', detail: 'Interval change in body weight, preserved with its source dates and units.' },
  CL: { title: 'Clinical observations', detail: 'In-life clinical observations linked to an animal and study day.' },
  EX: { title: 'Exposure administrations', detail: 'Administered treatment, dose, route and timing for each subject.' },
  PC: { title: 'Toxicokinetic concentrations', detail: 'Measured systemic analyte concentrations by subject, time point and specimen.' },
  PP: { title: 'Toxicokinetic parameters', detail: 'Derived exposure parameters such as Cmax and AUC with source lineage.' },
};

const domainLabels: Record<string, string> = {
  DM: 'Demographics', TX: 'Trial sets', MI: 'Microscopic findings', LB: 'Laboratory tests',
  MA: 'Macroscopic findings', OM: 'Organ measurements', BW: 'Body weights', BG: 'Body-weight gain',
  CL: 'Clinical observations', CV: 'Cardiovascular', EG: 'ECG tests', FW: 'Food and water',
  PC: 'Toxicokinetic concentrations', PP: 'Toxicokinetic parameters', SC: 'Subject characteristics', VS: 'Vital signs',
};

const pageSize = 12;

function entries(record: Record<string, unknown>) {
  return Object.entries(record).filter(([, item]) => item !== undefined && item !== null && item !== '');
}

function recordSummary(record: CanonicalEvidenceRecord) {
  return value(record.data, ['MISTRESC', 'MIORRES', 'LBTEST', 'TXPARM', 'DOMAIN', 'USUBJID', 'SUBJID']);
}

function laboratoryAssessment(record: CanonicalEvidenceRecord) {
  if (record.domain !== 'LB') return undefined;
  const sourceFlag = value(record.data, ['LBNRIND']);
  const result = Number(record.data.LBSTRESN);
  const lower = Number(record.data.LBSTNRLO);
  const upper = Number(record.data.LBSTNRHI);
  const hasResult = Number.isFinite(result);
  const hasLower = record.data.LBSTNRLO !== undefined && record.data.LBSTNRLO !== '' && Number.isFinite(lower);
  const hasUpper = record.data.LBSTNRHI !== undefined && record.data.LBSTNRHI !== '' && Number.isFinite(upper);
  if (['HIGH', 'LOW', 'ABNORMAL', 'H', 'L', 'ABN', 'A'].includes(sourceFlag.toUpperCase())) return { status: 'outside', label: `source flag ${sourceFlag}` };
  if (hasResult && hasLower && result < lower) return { status: 'outside', label: `below ${lower}` };
  if (hasResult && hasUpper && result > upper) return { status: 'outside', label: `above ${upper}` };
  if (hasResult && (hasLower || hasUpper)) return { status: 'within', label: 'within supplied limits' };
  if (['NORMAL', 'N'].includes(sourceFlag.toUpperCase())) return { status: 'within', label: `source flag ${sourceFlag}` };
  return { status: 'unassessed', label: 'reference range unavailable' };
}

export default function RecordEvidencePanel({ study, doseGroups, signal, focusDomain, initialScope = 'subject', initialSection, initialFilter = 'all', initialTestCode }: { study: StudySummary; doseGroups: DoseGroup[]; signal: SafetySignal; focusDomain?: EvidenceDomain; initialScope?: 'subject' | 'study'; initialSection?: 'records' | 'artifacts'; initialFilter?: CanonicalRecordPage['filter']; initialTestCode?: string }) {
  const [result, setResult] = useState<SignalRecordEvidence | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recordScope, setRecordScope] = useState<'subject' | 'study'>(initialScope);
  const [recordDomain, setRecordDomain] = useState<string>(focusDomain || 'MI');
  const [recordOffset, setRecordOffset] = useState(0);
  const [recordFilter, setRecordFilter] = useState<CanonicalRecordPage['filter']>(initialFilter);
  const [recordTestCode, setRecordTestCode] = useState<string | undefined>(initialTestCode);
  const [recordPage, setRecordPage] = useState<CanonicalRecordPage | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSelected(0);
    fetch(`/api/studies/${encodeURIComponent(study.id)}/signals/${encodeURIComponent(signal.id)}/records`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Record evidence could not be loaded');
        return response.json();
      })
      .then((data: SignalRecordEvidence) => {
        setResult(data);
        const preferred = focusDomain && data.domainInventory.some((item) => item.domain === focusDomain) ? focusDomain : data.domainInventory[0]?.domain;
        if (preferred) setRecordDomain(preferred);
      })
      .catch(() => { if (!controller.signal.aborted) setResult(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [focusDomain, signal.id, study.id]);

  useEffect(() => {
    setRecordFilter(initialFilter);
    setRecordTestCode(initialTestCode);
    setRecordOffset(0);
  }, [focusDomain, initialFilter, initialTestCode]);

  const selectedSubjectId = result?.subjects[selected]?.subjectId;
  useEffect(() => {
    if (!result?.available || !recordDomain || (recordScope === 'subject' && !selectedSubjectId)) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({ domain: recordDomain, scope: recordScope, filter: recordFilter, offset: String(recordOffset), limit: String(pageSize) });
    if (selectedSubjectId) parameters.set('subjectId', selectedSubjectId);
    if (signal.correlatedLab) parameters.set('linkedTestCode', signal.correlatedLab);
    if (recordTestCode) parameters.set('testCode', recordTestCode);
    setRecordLoading(true);
    fetch(`/api/studies/${encodeURIComponent(study.id)}/records?${parameters}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Canonical records could not be loaded');
        return response.json();
      })
      .then(setRecordPage)
      .catch(() => { if (!controller.signal.aborted) setRecordPage(null); })
      .finally(() => { if (!controller.signal.aborted) setRecordLoading(false); });
    return () => controller.abort();
  }, [recordDomain, recordFilter, recordOffset, recordScope, recordTestCode, result?.available, selectedSubjectId, signal.correlatedLab, study.id]);

  useEffect(() => {
    if (!result?.available || initialSection !== 'artifacts') return;
    window.setTimeout(() => document.getElementById('source-artifact-catalog')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  }, [initialSection, result?.available]);

  if (loading) return <div className="record-evidence-state"><LoaderCircle className="spin" size={18} /><span><b>Resolving source records</b><small>Following MI → subject → DM / TX / LB → immutable artifact</small></span></div>;
  if (!result?.available) return <div className="record-evidence-state empty"><Database size={18} /><span><b>Canonical evidence package not imported</b><small>The aggregate demonstration remains available. Import a verified Kehrnel solution-evidence package to activate row-level drilldown.</small></span></div>;

  const subject = result.subjects[selected] || result.subjects[0];
  const finding = subject?.findingRecords[0];
  const demographic = subject?.demographicRecord;
  const labs = subject?.laboratoryRecords || [];
  const treatment = result.treatmentRecords.find((record) => {
    const recordGroup = value(record.data, ['TXSETCD', 'SETCD', 'SPGRPCD', 'GRPID']);
    return subject?.treatmentGroup && recordGroup === subject.treatmentGroup;
  }) || result.treatmentRecords[0];
  const doseGroup = doseGroups.find((group) => group.code === subject?.treatmentGroup);
  const subjectRecordCount = Object.values(subject?.domainCounts || {}).reduce((sum, count) => sum + count, 0);
  return <div className="record-evidence-workspace">
    <header>
      <div><span className="panel-kicker">Canonical record drilldown</span><h2>Every visual claim resolves to source rows</h2></div>
      <div className="evidence-package-badge"><FileCheck2 size={13} /><span><b>Verified handoff</b><small>schema {result.modelSchemaVersion} · {result.packageId?.slice(0, 22)}…</small></span></div>
    </header>
    {focusDomain && <div className="record-domain-focus" data-domain={focusDomain}><span>{focusDomain}</span><div><b>Inspecting {domainFocusCopy[focusDomain].title}</b><small>{domainFocusCopy[focusDomain].detail}</small></div></div>}
    <div className="record-counts"><span><b>{result.counts.subjects}</b> subjects</span><span><b>{result.counts.findings}</b> MI rows</span><span><b>{result.counts.laboratory}</b> correlated LB rows</span><span><b>{result.counts.artifacts}</b> artifacts</span></div>
    <div className="signal-derivation"><span><small>Signal definition</small><b>{signal.organ} · {signal.finding}</b></span><i>→</i><span><small>Numerator</small><b>{signal.affectedAnimals} distinct animals with matching MI</b></span><i>÷</i><span><small>Denominator</small><b>{signal.totalAnimals} animals from DM</b></span><i>→</i><span><small>Dose comparison</small><b>{doseGroups.length} groups resolved through TX</b></span></div>
    <div className="record-evidence-body">
      <aside><span>Supporting animals</span>{result.subjects.map((item, index) => <button key={item.subjectId} className={selected === index ? 'active' : ''} onClick={() => { setSelected(index); setRecordOffset(0); }}><i>{String(index + 1).padStart(2, '0')}</i><span><b>{item.subjectId}</b><small>{item.treatmentGroup || 'group not projected'} · {Object.values(item.domainCounts).reduce((sum, count) => sum + count, 0)} source rows</small></span></button>)}</aside>
      {subject && <main>
        <section className="record-thread-head"><div><Fingerprint size={16} /><span><b>{subject.subjectId}</b><small>{subject.treatmentGroup || 'Treatment group unresolved'}</small></span></div><em>{subject.findingRecords.length} matching finding row{subject.findingRecords.length === 1 ? '' : 's'}</em></section>
        <div className="record-relationship-path" aria-label="Resolved source-data relationship"><article><small>Observed finding · MI</small><b>{signal.organ}</b><span>{signal.finding}</span></article><i>→</i><article><small>Animal identity · DM</small><b>{subject.subjectId}</b><span>group {subject.treatmentGroup || 'unresolved'}</span></article><i>→</i><article><small>Assigned exposure · TX</small><b>{doseGroup ? `${doseGroup.dose} ${doseGroup.unit}` : 'Dose unresolved'}</b><span>{doseGroup?.label || 'No matching trial set'}</span></article><i>→</i><article><small>Available context</small><b>{subjectRecordCount} source rows</b><span>{Object.keys(subject.domainCounts).join(' · ')}</span></article></div>
        <div className="record-cards">
          <article data-domain="MI" className={focusDomain === 'MI' ? 'domain-focused' : ''}><header><Microscope size={13} /><b>MI · finding</b></header><dl><div><dt>Specimen</dt><dd>{value(finding?.data, ['MISPEC', 'MIORRES'])}</dd></div><div><dt>Finding</dt><dd>{value(finding?.data, ['MISTRESC', 'MIORRES', 'MITEST'])}</dd></div><div><dt>Severity</dt><dd>{value(finding?.data, ['MISEV'])}</dd></div></dl><footer>{finding ? `row ${finding.lineage.sourceRow} · ${finding.lineage.recordHash.slice(0, 12)}…` : 'No MI row'}</footer></article>
          <article data-domain="DM" className={focusDomain === 'DM' ? 'domain-focused' : ''}><header><Database size={13} /><b>DM · identity</b></header><dl><div><dt>Sex</dt><dd>{value(demographic?.data, ['SEX'])}</dd></div><div><dt>Species</dt><dd>{value(demographic?.data, ['SPECIES'])}</dd></div><div><dt>Group</dt><dd>{value(demographic?.data, ['SPGRPCD', 'GRPID', 'ARMCD'])}</dd></div></dl><footer>{demographic ? `row ${demographic.lineage.sourceRow} · ${demographic.lineage.recordHash.slice(0, 12)}…` : 'No DM row'}</footer></article>
          <article data-domain="TX" className={focusDomain === 'TX' ? 'domain-focused' : ''}><header><Database size={13} /><b>TX · group definition</b></header><dl><div><dt>Set</dt><dd>{value(treatment?.data, ['TXSETCD', 'SETCD'])}</dd></div><div><dt>Parameter</dt><dd>{value(treatment?.data, ['TXPARM', 'TXPARMCD'])}</dd></div><div><dt>Value</dt><dd>{value(treatment?.data, ['TXVAL', 'TXVALCD', 'VALUE'])}</dd></div></dl><footer>{treatment ? `row ${treatment.lineage.sourceRow} · ${result.treatmentRecords.length} TX definitions` : 'No TX row'}</footer></article>
          <article data-domain="LB" className={focusDomain === 'LB' ? 'domain-focused' : ''}><header><Database size={13} /><b>LB · longitudinal context</b></header><dl><div><dt>Test</dt><dd>{value(labs[0]?.data, ['LBTESTCD', 'LBTEST'])}</dd></div><div><dt>Rows</dt><dd>{labs.length}</dd></div><div><dt>Days</dt><dd>{[...new Set(labs.map((item) => value(item.data, ['LBDY', 'LBSTDY'])))].slice(0, 6).join(', ') || '—'}</dd></div></dl><footer>{labs[0] ? `first row ${labs[0].lineage.sourceRow} · checksummed` : 'No matching LB rows'}</footer></article>
        </div>
        <div className="artifact-proof"><FileCheck2 size={14} /><span><b>Source proof</b><small>{result.sourceArtifacts.map((item) => `${item.sourceName || 'artifact'} · ${item.digest.value.slice(0, 10)}…`).join('  |  ')}</small></span></div>
        <section className="canonical-explorer">
          <header><div><span className="panel-kicker">Complete supportive source</span><h3>Canonical record explorer</h3><p>The cards above explain the visual claim. This explorer exposes every stored row without changing its canonical fields.</p></div><div className="record-scope" aria-label="Canonical record scope"><button className={recordScope === 'subject' ? 'active' : ''} onClick={() => { setRecordScope('subject'); setRecordOffset(0); }}>This subject</button><button className={recordScope === 'study' ? 'active' : ''} onClick={() => { setRecordScope('study'); setRecordOffset(0); }}>Entire study</button></div></header>
          <nav className="record-domain-tabs" aria-label="Available canonical domains">{result.domainInventory.map((item) => {
            const count = recordScope === 'subject' ? (subject.domainCounts[item.domain] || 0) : item.studyRecords;
            return <button key={item.domain} className={recordDomain === item.domain ? 'active' : ''} disabled={count === 0} onClick={() => { setRecordDomain(item.domain); setRecordFilter('all'); setRecordTestCode(undefined); setRecordOffset(0); }}><b>{item.domain}</b><span>{domainLabels[item.domain] || 'Canonical domain'}</span><em>{count.toLocaleString()}</em></button>;
          })}</nav>
          {recordDomain === 'LB' && <div className="laboratory-filters"><span>Laboratory evidence</span><button className={recordFilter === 'all' && !recordTestCode ? 'active' : ''} onClick={() => { setRecordFilter('all'); setRecordTestCode(undefined); setRecordOffset(0); }}>All results</button><button className={recordFilter === 'outside-range' ? 'active' : ''} onClick={() => { setRecordFilter('outside-range'); setRecordTestCode(undefined); setRecordOffset(0); }}>Outside supplied limits</button>{recordTestCode && <button className="active" onClick={() => { setRecordTestCode(undefined); setRecordOffset(0); }}>Test · {recordTestCode} ×</button>}{signal.correlatedLab && <button className={recordFilter === 'linked-test' ? 'active' : ''} onClick={() => { setRecordFilter('linked-test'); setRecordTestCode(undefined); setRecordOffset(0); }}>Linked test · {signal.correlatedLab}</button>}<button className={recordFilter === 'unassessed' ? 'active' : ''} onClick={() => { setRecordFilter('unassessed'); setRecordTestCode(undefined); setRecordOffset(0); }}>Range unavailable</button></div>}
          <div className="canonical-records">
            <div className="canonical-records-heading"><span><Rows3 size={13} /><b>{domainLabels[recordDomain] || recordDomain}</b></span><small>{recordPage ? `${recordPage.total.toLocaleString()} ${recordScope === 'subject' ? `rows for ${selectedSubjectId}` : 'rows in the study'}` : 'Resolving records'}</small></div>
            {recordLoading ? <div className="canonical-record-state"><LoaderCircle className="spin" size={16} /> Loading canonical rows…</div> : !recordPage?.records.length ? <div className="canonical-record-state empty"><Database size={16} /> {recordFilter === 'all' ? `No ${recordDomain} rows exist in this scope. The absence is preserved explicitly.` : 'No rows match this evidence filter. No threshold or relationship has been inferred.'}</div> : <div className="canonical-record-list">{recordPage.records.map((record) => <details key={record.sourceId}>
              <summary><span><b>{record.domain} · row {record.rowOrdinal}</b><small>{recordSummary(record)}</small></span>{laboratoryAssessment(record) && <em className={`laboratory-assessment ${laboratoryAssessment(record)?.status}`}>{laboratoryAssessment(record)?.label}</em>}<code>{record.sourceId}</code></summary>
              <div className="canonical-record-document">
                <section><h4>Canonical fields</h4><dl>{entries(record.data).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</dd></div>)}</dl></section>
                <section><h4>Record identity</h4><dl>{entries(record.recordKey).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{String(item)}</dd></div>)}</dl><h4>Retrieval facets</h4><dl>{entries(record.facets).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</dd></div>)}</dl></section>
              </div>
              <footer><Braces size={11} /> Canonical data remains unchanged · {record.lineage.sourceDataset} row {record.lineage.sourceRow} · {record.lineage.recordHash}</footer>
            </details>)}</div>}
          </div>
          <footer className="canonical-pagination"><span>Rows {recordPage?.total ? recordOffset + 1 : 0}–{Math.min(recordOffset + pageSize, recordPage?.total || 0)} of {recordPage?.total || 0}</span><div><button disabled={recordOffset === 0} onClick={() => setRecordOffset(Math.max(0, recordOffset - pageSize))}><ChevronLeft size={12} /> Previous</button><button disabled={!recordPage || recordOffset + pageSize >= recordPage.total} onClick={() => setRecordOffset(recordOffset + pageSize)}>Next <ChevronRight size={12} /></button></div></footer>
        </section>
        <section className="artifact-catalog" id="source-artifact-catalog"><header><FileCheck2 size={13} /><b>Immutable source artifacts</b><span>{result.sourceArtifacts.length} files</span></header><div>{result.sourceArtifacts.map((item) => <article key={item.sourceId}><b>{item.sourceName || item.sourceId}</b><small>{item.mediaType} · {item.size ? `${item.size.toLocaleString()} bytes` : 'size not supplied'}</small><code>{item.digest.algorithm}:{item.digest.value}</code></article>)}</div></section>
      </main>}
    </div>
  </div>;
}
