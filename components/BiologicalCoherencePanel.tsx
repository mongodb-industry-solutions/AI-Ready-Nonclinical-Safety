'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Binary, Braces, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, Database, FlaskConical, GitBranch, LoaderCircle, Save, Scale, ShieldCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdversityDecision, BiologicalCoherenceResponse, EndpointSummary, OperationalMeasurementSeries, ReversibilityDecision, SafetySignal, SemanticProfileId, SemanticRuntimeView, StudySummary, TargetOrganAssessmentRecord, TargetOrganConclusion } from '@/lib/contracts';
import type { EvidenceDomain } from '@/components/EvidenceAssembly';
import { useThemeTokens } from '@/lib/useThemeTokens';

function normalized(value: string | undefined) {
  return (value || '').trim().toUpperCase();
}

function aggregateIncidence(rows: EndpointSummary[]) {
  const byDose = new Map<number, { dose: number; affected: number; examined: number }>();
  for (const row of rows) {
    if (!row.incidence || row.group?.dose === undefined) continue;
    if (!byDose.has(row.group.dose)) byDose.set(row.group.dose, { dose: row.group.dose, affected: 0, examined: 0 });
    const point = byDose.get(row.group.dose)!;
    point.affected += row.incidence.affected;
    point.examined += row.incidence.examined;
  }
  return [...byDose.values()].sort((left, right) => left.dose - right.dose).map((point) => ({
    ...point,
    rate: point.examined ? Number(((point.affected / point.examined) * 100).toFixed(1)) : 0,
  }));
}

function measurementChart(series: OperationalMeasurementSeries[]) {
  const rows = new Map<number, Record<string, number | string>>();
  const keys = new Set<string>();
  for (const item of series) {
    const key = `${item.sex || 'ALL'} · ${item.phase || 'ALL'}`;
    keys.add(key);
    for (const point of item.points) {
      if (point.group?.dose === undefined) continue;
      if (!rows.has(point.group.dose)) rows.set(point.group.dose, { dose: point.group.dose });
      rows.get(point.group.dose)![key] = point.statistics.mean;
    }
  }
  return { rows: [...rows.values()].sort((left, right) => Number(left.dose) - Number(right.dose)), keys: [...keys] };
}

export default function BiologicalCoherencePanel({ study, signal, profileId, runtime, onShowSource, onOpenSemantic }: {
  study: StudySummary;
  signal: SafetySignal;
  profileId: SemanticProfileId;
  runtime?: SemanticRuntimeView;
  onShowSource: (domain: EvidenceDomain) => void;
  onOpenSemantic: (focusId?: string) => void;
}) {
  const theme = useThemeTokens();
  const [result, setResult] = useState<BiologicalCoherenceResponse>();
  const [error, setError] = useState('');
  const [sex, setSex] = useState('ALL');
  const [phase, setPhase] = useState('ALL');
  const [measurement, setMeasurement] = useState('OWBW');
  const [targetOrganConclusion, setTargetOrganConclusion] = useState<TargetOrganConclusion>('INDETERMINATE');
  const [adversityDecision, setAdversityDecision] = useState<AdversityDecision>('NOT ASSESSED');
  const [reversibility, setReversibility] = useState<ReversibilityDecision>('NOT ASSESSED');
  const [rationale, setRationale] = useState('');
  const [citedEndpointIds, setCitedEndpointIds] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<TargetOrganAssessmentRecord>();
  const [assessmentError, setAssessmentError] = useState('');
  const [assessmentBusy, setAssessmentBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError('');
    fetch(`/api/studies/${encodeURIComponent(study.id)}/signals/${encodeURIComponent(signal.id)}/coherence?profile=${encodeURIComponent(profileId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Biological coherence could not be resolved');
        setResult(value);
      })
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, [profileId, signal.id, study.id]);

  const filteredEndpoints = useMemo(() => (result?.targetOrgan.endpointSummaries || []).filter((item) =>
    (sex === 'ALL' || item.sex === sex) && (phase === 'ALL' || item.phase === phase)), [phase, result, sex]);
  const findingEndpoints = useMemo(() => filteredEndpoints.filter((item) => item.domain === 'MI'
    && normalized(item.finding) === normalized(signal.finding)), [filteredEndpoints, signal.finding]);
  const incidence = useMemo(() => aggregateIncidence(findingEndpoints), [findingEndpoints]);
  const organSeries = useMemo(() => (result?.targetOrgan.measurementSeries || []).filter((item) => item.domain === 'OM'
    && item.testCode === measurement && (sex === 'ALL' || item.sex === sex) && (phase === 'ALL' || item.phase === phase)), [measurement, phase, result, sex]);
  const organChart = useMemo(() => measurementChart(organSeries), [organSeries]);
  const availableMeasurements = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const item of result?.targetOrgan.measurementSeries || []) byCode.set(item.testCode, item.test);
    return [...byCode.entries()];
  }, [result]);
  useEffect(() => {
    if (availableMeasurements.length && !availableMeasurements.some(([code]) => code === measurement)) setMeasurement(availableMeasurements[0][0]);
  }, [availableMeasurements, measurement]);
  const assessmentCandidates = useMemo(() => {
    const rows = result?.targetOrgan.endpointSummaries || [];
    const findingRows = rows.filter((item) => item.domain === 'MI' && normalized(item.finding) === normalized(signal.finding));
    const supportingRows = rows.filter((item) => ['MA', 'OM'].includes(item.domain));
    return [...findingRows, ...supportingRows].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 12);
  }, [result, signal.finding]);
  useEffect(() => {
    setCitedEndpointIds(assessmentCandidates.slice(0, 4).map((item) => item.id));
    setAssessment(undefined);
    setAssessmentError('');
  }, [assessmentCandidates, signal.id]);

  async function submitAssessment() {
    if (rationale.trim().length < 12 || !citedEndpointIds.length) return;
    setAssessmentBusy(true);
    setAssessmentError('');
    try {
      const response = await fetch('/api/target-organ-assessments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studyId: study.id, snapshotId: study.snapshotId, signalId: signal.id, organ: signal.organ, profileId, targetOrganConclusion, adversityDecision, reversibility, rationale, citedEndpointIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The target-organ assessment could not be recorded');
      setAssessment(payload.assessment);
      setRationale('');
    } catch (cause) {
      setAssessmentError(cause instanceof Error ? cause.message : 'The target-organ assessment could not be recorded');
    } finally {
      setAssessmentBusy(false);
    }
  }

  if (!result && !error) return <div className="coherence-state"><LoaderCircle className="spin" size={20} /><span><b>Resolving biological coherence</b><small>Compiling the target-organ archetype into real MongoDB reads…</small></span></div>;
  if (error || !result?.available) return <div className="coherence-state empty"><CircleAlert size={20} /><span><b>Operational projection unavailable</b><small>{error || 'Import the reconciled Kehrnel evidence package to activate this view.'}</small></span></div>;

  const selectedMeasurement = organSeries[0];
  const domainCounts = {
    MI: filteredEndpoints.filter((item) => item.domain === 'MI').length,
    MA: filteredEndpoints.filter((item) => item.domain === 'MA').length,
    OM: organSeries.length,
    BW: result.systemicContext.bodyWeightSeries.filter((item) => (sex === 'ALL' || item.sex === sex) && (phase === 'ALL' || item.phase === phase)).length,
    PK: result.systemicContext.exposureSeries.filter((item) => (sex === 'ALL' || item.sex === sex) && (phase === 'ALL' || item.phase === phase)).length,
  };
  const sourceRelationshipCount = result.relationships.length;

  return <div className="coherence-workspace">
    <header className="coherence-header">
      <div><span className="panel-kicker">Target-organ biological coherence</span><h2>{signal.organ} · {signal.finding}</h2><p>Pathology is the anchor. Organ weight, body weight, exposure, recovery, and source-declared relationships remain separate evidence lanes until an expert interprets them together.</p></div>
      <div className="coherence-filters">
        <label>Sex<select value={sex} onChange={(event) => setSex(event.target.value)}><option value="ALL">All</option>{result.filters.sexes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Phase<select value={phase} onChange={(event) => setPhase(event.target.value)}><option value="ALL">All</option>{result.filters.phases.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
    </header>
    <div className="coherence-inventory">
      <span><b>{result.inventory.endpointSummaries}</b> target-organ summaries</span>
      <span><b>{result.inventory.measurementSeries}</b> measurement series</span>
      <span><b>{sourceRelationshipCount}</b> source-declared links</span>
      <span><b>{result.inventory.sourceRecordCitations.toLocaleString()}</b> cited source records</span>
    </div>
    <div className="coherence-grid">
      <article className="coherence-card coherence-chart-card">
        <header><div><span>MI · incidence</span><h3>Microscopic finding by dose</h3></div><button onClick={() => onShowSource('MI')}><Database size={13} /> Source rows</button></header>
        <div className="coherence-chart">
          {theme && incidence.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={incidence} margin={{ top: 9, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke={theme.grid} strokeDasharray="3 4" vertical={false} /><XAxis dataKey="dose" tick={{ fill: theme.tick, fontSize: 11 }} axisLine={{ stroke: theme.axis }} tickLine={false} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={theme.tooltip} formatter={(value) => [`${value}%`, 'Incidence']} /><Bar dataKey="rate" fill={theme.accent} radius={[6, 6, 1, 1]} maxBarSize={42} /></BarChart></ResponsiveContainer> : <div className="coherence-no-data">No matching MI endpoint in this filter.</div>}
        </div>
        <footer>{incidence.map((item) => <span key={item.dose}><b>{item.dose} mg/kg</b>{item.affected}/{item.examined}</span>)}</footer>
      </article>

      <article className="coherence-card coherence-chart-card">
        <header><div><span>OM · organ measurements</span><h3>{selectedMeasurement?.test || availableMeasurements[0]?.[1] || 'Organ measurement'}</h3></div><select value={measurement} onChange={(event) => setMeasurement(event.target.value)}>{availableMeasurements.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></header>
        <div className="coherence-chart">
          {theme && organChart.rows.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={organChart.rows} margin={{ top: 9, right: 8, left: -12, bottom: 0 }}><CartesianGrid stroke={theme.grid} strokeDasharray="3 4" vertical={false} /><XAxis dataKey="dose" tick={{ fill: theme.tick, fontSize: 11 }} axisLine={{ stroke: theme.axis }} tickLine={false} /><YAxis tick={{ fill: theme.tick, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={theme.tooltip} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />{organChart.keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} stroke={theme.series[index % theme.series.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}</LineChart></ResponsiveContainer> : <div className="coherence-no-data">No organ measurement series in this filter.</div>}
        </div>
        <footer><span><b>Mean ± source range</b>{selectedMeasurement?.unit || 'source unit'}</span><button onClick={() => onShowSource('OM')}><Database size={12} /> Inspect OM</button></footer>
      </article>

      <article className="coherence-card evidence-lanes">
        <header><div><span>Cross-domain evidence</span><h3>What the resolver actually found</h3></div><button onClick={() => onOpenSemantic('EndpointSummary')}><Braces size={13} /> Ask the map</button></header>
        <div className="evidence-lane-list">
          {[
            { domain: 'MI', icon: FlaskConical, title: 'Microscopy', count: domainCounts.MI, object: 'Finding', note: 'Observed tissue morphology and severity' },
            { domain: 'MA', icon: Activity, title: 'Gross pathology', count: domainCounts.MA, object: 'MacroscopicFinding', note: 'Macroscopic context at necropsy' },
            { domain: 'OM', icon: Scale, title: 'Organ measurements', count: domainCounts.OM, object: 'OrganMeasurement', note: 'Absolute and normalized weight series' },
            { domain: 'BW', icon: Activity, title: 'Body weight', count: domainCounts.BW, object: 'BodyWeightMeasurement', note: 'Systemic longitudinal context' },
            { domain: 'PC', icon: Binary, title: 'Systemic exposure', count: domainCounts.PK, object: 'PkConcentration', note: 'PC concentration and PP parameters' },
          ].map((lane) => <button key={lane.domain} onClick={() => lane.domain === 'PC' ? onOpenSemantic(lane.object) : onShowSource(lane.domain as EvidenceDomain)}><lane.icon size={15} /><span><b>{lane.title}</b><small>{lane.note}</small></span><em>{lane.count}</em><ChevronRight size={13} /></button>)}
        </div>
      </article>

      <article className="coherence-card confidence-boundary">
        <header><div><span>Interpretation boundary</span><h3>What is known—and what is not</h3></div><ShieldCheck size={17} /></header>
        <div className="boundary-row good"><GitBranch size={15} /><span><b>{sourceRelationshipCount} source-declared relationships</b><small>RELREC links are shown as source assertions, distinct from governed joins.</small></span></div>
        <div className="boundary-row warning"><CircleAlert size={15} /><span><b>Laboratory normal limits</b><small>{result.systemicContext.laboratoryCoverage.interpretation}</small></span></div>
        <div className="boundary-row neutral"><Activity size={15} /><span><b>No automatic adversity conclusion</b><small>Dose response and recovery are evidence; target-organ relevance and adversity remain expert decisions.</small></span></div>
      </article>
    </div>

    <section className="coherence-execution">
      <header><div><span className="panel-kicker">Executed deterministic contract</span><h3>{result.execution.resolverId}</h3></div><em>{result.semanticReleaseId}</em></header>
      <div className="plan-strip">{result.execution.declaredStages.map((stage, index) => <span key={stage}><i>{index + 1}</i>{stage}</span>)}</div>
      <div className="operation-table">{result.execution.dataOperations.map((operation) => <div key={operation.id}><span><Database size={12} />{operation.collection}</span><code>{operation.plan?.indexes.join(', ') || operation.operation}</code><b>{operation.resultCount.toLocaleString()} rows{operation.plan?.documentsExamined !== undefined ? ` · ${operation.plan.documentsExamined.toLocaleString()} examined` : ''}</b><em>{operation.durationMs} ms</em></div>)}</div>
      <footer><span><ShieldCheck size={12} /> Snapshot {study.snapshotId}</span><span>Containment: {result.execution.containmentPlan?.contains.join(' → ')}</span><span>Policies: {result.execution.policies.join(' · ')}</span></footer>
    </section>

    <section className="target-organ-assessment">
      <header><div><span className="panel-kicker">Governed expert interpretation</span><h3>Assess the target-organ hypothesis</h3><p>The system assembles evidence; a toxicologist or study director owns the conclusion. Every decision cites immutable endpoint summaries.</p></div><ClipboardCheck size={21} /></header>
      {profileId === 'toxicologist' || profileId === 'study-director' ? <>
        <div className="assessment-fields">
          <label>Target-organ conclusion<select value={targetOrganConclusion} onChange={(event) => setTargetOrganConclusion(event.target.value as TargetOrganConclusion)}>{(runtime?.valueSets.find((item) => item.id === 'target-organ-conclusion')?.values || ['TARGET ORGAN', 'NOT TARGET ORGAN', 'INDETERMINATE']).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Adversity<select value={adversityDecision} onChange={(event) => setAdversityDecision(event.target.value as AdversityDecision)}>{(runtime?.valueSets.find((item) => item.id === 'adversity-decision')?.values || ['ADVERSE', 'NON-ADVERSE', 'EQUIVOCAL', 'NOT ASSESSED']).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Reversibility<select value={reversibility} onChange={(event) => setReversibility(event.target.value as ReversibilityDecision)}>{(runtime?.valueSets.find((item) => item.id === 'reversibility-decision')?.values || ['RECOVERED', 'PARTIALLY RECOVERED', 'PERSISTENT', 'NOT ASSESSED']).map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="assessment-evidence">
          <div><b>Cited endpoints</b><small>{citedEndpointIds.length} selected · selection is explicit and editable</small></div>
          <div className="assessment-citations">{assessmentCandidates.map((endpoint) => <label key={endpoint.id}><input type="checkbox" checked={citedEndpointIds.includes(endpoint.id)} onChange={() => setCitedEndpointIds((current) => current.includes(endpoint.id) ? current.filter((id) => id !== endpoint.id) : [...current, endpoint.id])} /><span><b>{endpoint.domain} · {endpoint.test}</b><small>{endpoint.finding || endpoint.organ || 'measurement'} · {endpoint.group?.dose ?? '—'} {endpoint.group?.unit || ''} · {endpoint.sex || 'all sexes'} · {endpoint.phase || 'phase not supplied'}</small></span></label>)}</div>
        </div>
        <div className="assessment-rationale"><textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Document the biological rationale, uncertainty, and evidence that influenced the decision…" /><button disabled={assessmentBusy || rationale.trim().length < 12 || !citedEndpointIds.length} onClick={submitAssessment}><Save size={13} />{assessmentBusy ? 'Validating contract…' : 'Record assessment'}</button></div>
        {assessmentError && <p className="assessment-message error"><CircleAlert size={13} />{assessmentError}</p>}
        {assessment && <p className="assessment-message success"><CheckCircle2 size={13} /><span><b>{assessment.status}</b> · {assessment.assessmentDigest.slice(0, 22)}… · source evidence unchanged</span></p>}
      </> : <p className="assessment-message"><ShieldCheck size={13} /> This profile may inspect the evidence but cannot write a target-organ assessment.</p>}
    </section>
  </div>;
}
