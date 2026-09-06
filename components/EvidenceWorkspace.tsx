'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, BookOpenCheck, ChevronRight, CircleAlert, Database, Expand, FlaskConical, GitBranch, LoaderCircle, Scale, ShieldCheck } from 'lucide-react';
import type { BiologicalCoherenceResponse, EndpointSummary, OperationalMeasurementSeries, SafetySignal, SemanticProfileId, SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';
import type { EvidenceDomain } from '@/components/EvidenceAssembly';
import BiologicalCoherencePanel from '@/components/BiologicalCoherencePanel';
import EvidenceGraph from '@/components/EvidenceGraph';
import MeasurementTrajectoryChart, { type MeasurementPointSelection } from '@/components/MeasurementTrajectoryChart';

export type EvidenceWorkspacePreview = {
  title: string;
  detail: string;
  domain: EvidenceDomain;
  series: OperationalMeasurementSeries[];
  endpoints: EndpointSummary[];
};

type WorkspaceTab = 'overview' | 'pathology' | 'systemic' | 'exposure' | 'course' | 'network' | 'decision' | 'plan';

const dimensions: Array<{ id: WorkspaceTab; domains: EvidenceDomain[]; label: string; question: string }> = [
  { id: 'pathology', domains: ['MI', 'MA', 'OM'], label: 'Pathology & organs', question: 'Do gross, microscopic, and organ measurements agree?' },
  { id: 'systemic', domains: ['BW', 'BG', 'FW', 'LB'], label: 'Systemic response', question: 'Do weight, intake, and laboratory changes support the finding?' },
  { id: 'exposure', domains: ['EX', 'PC', 'PP'], label: 'Dose & exposure', question: 'When was treatment given and what exposure was measured?' },
  { id: 'course', domains: ['CL', 'SE', 'DS'], label: 'Study course', question: 'When did observations occur, including recovery and disposition?' },
];

function domainLabel(code: string) {
  return ({ BW: 'Body weight', BG: 'Weight gain', FW: 'Food consumption', LB: 'Laboratory', PC: 'Concentrations', PP: 'Exposure parameters', EX: 'Administered dose', MI: 'Microscopy', MA: 'Gross pathology', OM: 'Organ measurements', CL: 'Clinical observations', SE: 'Study elements', DS: 'Disposition' } as Record<string, string>)[code] || code;
}

export default function EvidenceWorkspace({ evidence, signal, profileId, runtime, onShowSource, onInspect, onOpenSemantic }: {
  evidence: StudyEvidence;
  signal: SafetySignal;
  profileId: SemanticProfileId;
  runtime: SemanticRuntimeView;
  onShowSource: (domain: EvidenceDomain, sourceRecordIds?: string[], testCode?: string) => void;
  onInspect: (preview: EvidenceWorkspacePreview) => void;
  onOpenSemantic: (focusId?: string) => void;
}) {
  const [result, setResult] = useState<BiologicalCoherenceResponse>();
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [domain, setDomain] = useState<EvidenceDomain>('BW');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError('');
    fetch('/api/studies/' + encodeURIComponent(evidence.study.id) + '/signals/' + encodeURIComponent(signal.id) + '/coherence?profile=' + encodeURIComponent(profileId), { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Evidence workspace could not be loaded');
        return payload;
      })
      .then(setResult)
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Evidence workspace could not be loaded'); });
    return () => controller.abort();
  }, [evidence.study.id, profileId, signal.id]);

  const allSeries = useMemo(() => result ? [...result.targetOrgan.measurementSeries, ...result.systemicContext.bodyWeightSeries, ...result.systemicContext.foodConsumptionSeries, ...result.systemicContext.exposureSeries] : [], [result]);
  const selectedDomainSeries = allSeries.filter((item) => item.domain === domain);
  const selectedSeries = selectedDomainSeries.find((item) => item.id === selectedSeriesId) || selectedDomainSeries[0];
  const endpoints = result?.systemicContext.measurementEndpoints || [];
  const pointSource = (point: MeasurementPointSelection) => onShowSource(point.domain as EvidenceDomain, point.sourceRecordIds, point.testCode);

  if (error) return <div className="evidence-workspace-state"><CircleAlert size={18} /><span><b>Evidence workspace unavailable</b><small>{error}</small></span></div>;
  if (!result) return <div className="evidence-workspace-state"><LoaderCircle className="spin" size={18} /><span><b>Resolving evidence dimensions</b><small>Endpoint summaries · measurement series · subject timelines · source relationships</small></span></div>;

  const domainCount = (code: string) => result.inventory.domainCounts[code] || 0;
  const timelineEvents = result.systemicContext.subjectTimelines.flatMap((timeline) => timeline.events.map((event) => ({ ...event, subjectId: timeline.subjectId })));
  const visibleEvents = timelineEvents
    .filter((event) => tab === 'exposure' ? event.domain === 'EX' : ['CL', 'SE', 'DS'].includes(event.domain))
    .sort((left, right) => (left.studyDay ?? 999999) - (right.studyDay ?? 999999));

  function switchDimension(next: WorkspaceTab, domains: EvidenceDomain[]) {
    setTab(next);
    const first = domains.find((code) => domainCount(code));
    if (first) setDomain(first);
    setSelectedSeriesId('');
  }

  return <div className="evidence-workspace">
    <header className="evidence-workspace-head">
      <div><span className="panel-kicker">Dynamic evidence workspace</span><h2>Which evidence exists, what is relevant, and what does it show?</h2><p>Only the selected evidence dimension is expanded. Every visual point remains linked to immutable SEND rows.</p></div>
      <div className="workspace-proof"><ShieldCheck size={14} /><span><b>{result.inventory.sourceRecordCitations.toLocaleString()} cited rows</b><small>{result.semanticReleaseId}</small></span></div>
    </header>
    <nav className="workspace-tabs" aria-label="Evidence workspace views">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><BarChart3 size={13} /> Overview</button>
      {dimensions.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => switchDimension(item.id, item.domains)}><Activity size={13} /> {item.label}<em>{item.domains.reduce((sum, code) => sum + domainCount(code), 0)}</em></button>)}
      <button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}><GitBranch size={13} /> Relationships</button>
      <button className={tab === 'decision' ? 'active' : ''} onClick={() => setTab('decision')}><BookOpenCheck size={13} /> Expert decision</button>
      <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}><Database size={13} /> Query plan</button>
    </nav>

    {tab === 'overview' && <div className="dimension-grid">
      {dimensions.map((item) => {
        const count = item.domains.reduce((sum, code) => sum + domainCount(code), 0);
        return <button key={item.id} className={count ? '' : 'unavailable'} onClick={() => count && switchDimension(item.id, item.domains)} disabled={!count}>
          <span>{item.label}</span><strong>{count ? count.toLocaleString() + ' projected observations' : 'Not present in this study'}</strong><p>{item.question}</p>
          <div>{item.domains.map((code) => <i className={domainCount(code) ? 'available' : ''} key={code}>{code}<small>{domainCount(code)}</small></i>)}</div>
          {count ? <ChevronRight size={15} /> : <CircleAlert size={15} />}
        </button>;
      })}
      <article className="relevance-card"><FlaskConical size={18} /><span><b>Relevant to this finding</b><p>{signal.organ} · {signal.finding} is anchored in MI. MA and OM provide local concordance; BW/BG/FW/LB test systemic coherence; EX/PC/PP establish exposure; CL/SE/DS establish time and recovery context.</p></span></article>
    </div>}

    {(tab === 'systemic' || tab === 'exposure' || tab === 'pathology') && <section className="trajectory-workbench">
      <aside><span className="panel-kicker">Available evidence</span>{(tab === 'systemic' ? ['BW', 'BG', 'FW', 'LB'] : tab === 'exposure' ? ['PC', 'PP', 'EX'] : ['MI', 'MA', 'OM']).map((code) => <button key={code} disabled={!domainCount(code)} className={domain === code ? 'active' : ''} onClick={() => { setDomain(code as EvidenceDomain); setSelectedSeriesId(''); }}><b>{code}</b><span>{domainLabel(code)}</span><em>{domainCount(code)}</em></button>)}</aside>
      <main>
        {(domain === 'EX' || domain === 'MI' || domain === 'MA' || domain === 'LB') ? <EventList domain={domain} events={domain === 'EX' ? visibleEvents : []} endpoints={
          domain === 'MI' || domain === 'MA'
            ? result.targetOrgan.endpointSummaries.filter((item) => item.domain === domain)
            : domain === 'LB'
              ? result.systemicContext.laboratoryAbnormalities.map((item, index) => ({ id: 'LB:' + index, endpointType: 'numeric', domain: 'LB', testCode: item.testCode, test: item.test, sourceRecordIds: item.sourceRecordIds, projectionDigest: '', projectionVersion: '', semanticReleaseId: result.semanticReleaseId } satisfies EndpointSummary))
              : []
        } onShowSource={onShowSource} /> : <>
          <header className="trajectory-head"><div><span className="panel-kicker">{domain} trajectory</span><h3>{selectedSeries?.test || 'No series available'}</h3></div><div>{selectedDomainSeries.length > 1 && <select value={selectedSeries?.id || ''} onChange={(event) => setSelectedSeriesId(event.target.value)}>{selectedDomainSeries.map((item) => <option key={item.id} value={item.id}>{item.test} · {item.sex || 'ALL'} · {item.phase || 'ALL'}</option>)}</select>}<button disabled={!selectedSeries} onClick={() => selectedSeries && onInspect({ title: selectedSeries.domain + ' · ' + selectedSeries.test, detail: [selectedSeries.sex || 'All sexes', selectedSeries.phase || 'All phases', selectedSeries.unit || 'unit not supplied'].join(' · '), domain: selectedSeries.domain as EvidenceDomain, series: [selectedSeries], endpoints })}><Expand size={13} /> Inspect</button></div></header>
          <MeasurementTrajectoryChart series={selectedSeries ? [selectedSeries] : []} endpoints={endpoints} onSelectPoint={pointSource} />
          <footer><span><Scale size={12} /> Click a point for exact canonical rows</span><span>{selectedSeries?.sourceRecordIds.length || 0} source citations in this series</span></footer>
        </>}
      </main>
    </section>}

    {tab === 'course' && <section className="course-workbench"><header><div><span className="panel-kicker">Study course</span><h3>Clinical observations, study phases, recovery, and disposition</h3></div><span>{result.systemicContext.subjectTimelines.length} signal-animal timelines</span></header><EventList domain="CL" events={visibleEvents} endpoints={result.systemicContext.clinicalObservations} onShowSource={onShowSource} /></section>}
    {tab === 'network' && <EvidenceGraph evidence={evidence} signal={signal} immersive />}
    {tab === 'decision' && <BiologicalCoherencePanel study={evidence.study} signal={signal} profileId={profileId} runtime={runtime} onShowSource={(nextDomain, filter, scope, testCode) => onShowSource(nextDomain, undefined, testCode)} onOpenSemantic={onOpenSemantic} />}
    {tab === 'plan' && <section className="workspace-plan"><header><div><span className="panel-kicker">Actually executed</span><h3>{result.execution.resolverId}</h3></div><em>{result.execution.executedAt}</em></header>{result.execution.dataOperations.map((operation) => <article key={operation.id}><span><Database size={13} /><b>{operation.collection}.{operation.operation}</b></span><code>{JSON.stringify(operation.predicate)}</code><div><strong>{operation.resultCount.toLocaleString()} rows</strong><small>{operation.durationMs} ms · {operation.plan?.indexes.join(', ') || 'explain unavailable'}</small></div></article>)}</section>}
  </div>;
}

function EventList({ domain, events, endpoints, onShowSource }: {
  domain: EvidenceDomain;
  events: Array<{ sourceRecordId: string; domain: string; studyDay?: number; phase?: string; testCode?: string; test?: string; result?: string; numericResult?: number; unit?: string; severity?: string; element?: string; subjectId?: string }>;
  endpoints: EndpointSummary[];
  onShowSource: (domain: EvidenceDomain, sourceRecordIds?: string[], testCode?: string) => void;
}) {
  type EventRow = { sourceRecordId?: string; sourceRecordIds?: string[]; domain: string; studyDay?: number; phase?: string; testCode?: string; test?: string; result?: string; numericResult?: number; unit?: string; severity?: string; element?: string; subjectId?: string };
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => setVisibleCount(100), [domain, endpoints, events]);
  const rows: EventRow[] = events.length ? events : endpoints.map((item) => ({ sourceRecordIds: item.sourceRecordIds, domain: item.domain, studyDay: item.studyDay, phase: item.phase, testCode: item.testCode, test: item.test, result: item.finding, severity: Object.keys(item.severity || {}).join(', ') }));
  const visibleRows = rows.slice(0, visibleCount);
  return <div className="evidence-event-browser"><div className="evidence-event-list">{rows.length ? visibleRows.map((event, index) => {
    const sourceRecordIds = event.sourceRecordIds?.length ? event.sourceRecordIds : event.sourceRecordId ? [event.sourceRecordId] : undefined;
    return <button key={(event.sourceRecordId || event.testCode || domain) + ':' + index} onClick={() => onShowSource(event.domain as EvidenceDomain, sourceRecordIds, event.testCode)}><i>{event.domain}</i><span><b>{event.test || event.testCode || event.element || 'Study event'}</b><small>{event.subjectId ? event.subjectId + ' · ' : ''}{event.phase || 'phase not supplied'} · day {event.studyDay ?? '—'}{event.severity ? ' · ' + event.severity : ''}</small></span><em>{event.result || (event.numericResult !== undefined ? String(event.numericResult) + ' ' + (event.unit || '') : 'source row')}</em><ChevronRight size={13} /></button>;
  }) : <div className="evidence-chart-empty">This study does not expose this evidence dimension for the selected signal animals.</div>}</div>{rows.length > 100 && <footer className="evidence-event-pagination"><span>Showing {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} evidence rows</span>{visibleRows.length < rows.length && <button onClick={() => setVisibleCount((count) => Math.min(rows.length, count + 100))}>Load next {Math.min(100, rows.length - visibleRows.length)}</button>}</footer>}</div>;
}
