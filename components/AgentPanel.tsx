'use client';

import { useMemo, useState } from 'react';
import { Activity, Bot, Braces, CheckCircle2, ChevronRight, Database, GitBranch, Maximize2, Minimize2, SearchCode, Send, ShieldCheck, Sparkles } from 'lucide-react';
import type { InvestigationResult, SafetySignal, SemanticProfileId, SemanticRuntimeView, StudyEvidence, StudySummary } from '@/lib/contracts';
import DoseResponseChart from '@/components/DoseResponseChart';
import EvidenceGraph from '@/components/EvidenceGraph';
import LabTrajectoryChart from '@/components/LabTrajectoryChart';

const prompts = [
  'Is this finding plausibly treatment-related?',
  'Compare incidence and severity across doses.',
  'Show the cross-domain evidence and its lineage.',
];

type SemanticHit = {
  resourceType: string;
  resourceId: string;
  label: string;
  excerpt: string;
  score: number;
  lanes: string[];
};

type SemanticSearchResponse = {
  mode: string;
  hits: SemanticHit[];
  releaseId: string;
  profileId: SemanticProfileId;
  stages: Array<{ id: string; status: 'executed' | 'fallback' | 'skipped'; detail: string }>;
  managedEmbedding: {
    index: string;
    sourcePath: string;
    vectorStorage: string;
    vectorFieldInSourceDocument: boolean;
  };
};

interface AgentPanelProps {
  study: StudySummary;
  signal: SafetySignal;
  profileId?: SemanticProfileId;
  enabled?: boolean;
  id?: string;
  evidence?: StudyEvidence;
  runtime?: SemanticRuntimeView;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onShowSource?: () => void;
  onOpenSemantic?: (focusId?: string) => void;
}

function semanticObjectForHit(hit: SemanticHit, runtime?: SemanticRuntimeView): string | undefined {
  if (hit.resourceType === 'object') return hit.resourceId;
  if (hit.resourceType === 'valueSet') return runtime?.valueSets.find((item) => item.id === hit.resourceId)?.binding.split('.')[0];
  if (hit.resourceType === 'concept') return runtime?.taxonomy.concepts.find((item) => item.id === hit.resourceId)?.semanticObjects[0];
  if (hit.resourceType === 'archetype') return runtime?.archetypes.find((item) => item.id === hit.resourceId)?.members[0]?.semanticObject;
  if (hit.resourceType === 'storageBinding') return runtime?.storageBindings.find((item) => item.id === hit.resourceId)?.semanticObject;
  return undefined;
}

export default function AgentPanel({ study, signal, profileId = 'toxicologist', enabled = true, id, evidence, runtime, expanded = false, onToggleExpanded, onShowSource, onOpenSemantic }: AgentPanelProps) {
  const [question, setQuestion] = useState(prompts[0]);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [semanticSearch, setSemanticSearch] = useState<SemanticSearchResponse | null>(null);
  const [selectedMeaningId, setSelectedMeaningId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lab = signal.correlatedLab && evidence ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  const findingConcepts = useMemo(() => runtime?.taxonomy.concepts.filter((concept) => concept.semanticObjects.includes('Finding')) || [], [runtime]);
  const findingValueSets = useMemo(() => runtime?.valueSets.filter((valueSet) => valueSet.binding.startsWith('Finding.')) || [], [runtime]);
  const selectedMeaning = semanticSearch?.hits.find((hit) => hit.resourceId === selectedMeaningId) || semanticSearch?.hits[0];

  async function ask(nextQuestion = question) {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    setQuestion(nextQuestion);
    try {
      const semanticQuery = `${signal.organ} ${signal.finding}. ${nextQuestion}`;
      const [response, semanticResponse] = await Promise.all([
        fetch('/api/investigations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studyId: study.id, signalId: signal.id, profileId, question: nextQuestion }) }),
        fetch(`/api/semantics/search?profile=${profileId}&q=${encodeURIComponent(semanticQuery)}&limit=8`, { cache: 'no-store' }).catch(() => null),
      ]);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The investigation could not be authorized');
      setResult(payload);
      if (semanticResponse?.ok) {
        const semanticPayload = await semanticResponse.json() as SemanticSearchResponse;
        setSemanticSearch(semanticPayload);
        setSelectedMeaningId(semanticPayload.hits[0]?.resourceId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The investigation could not be authorized');
    } finally { setBusy(false); }
  }

  function askWithMeaning(hit: SemanticHit) {
    void ask(`${question} Resolve the question using the governed ${hit.resourceType} “${hit.label}” (${hit.resourceId}) and state if that interpretation changes the conclusion.`);
  }

  return <aside className={`agent-panel ${expanded ? 'agent-panel-expanded' : ''}`} id={id}>
    <div className="agent-heading"><span className="agent-orb"><Sparkles size={17} /></span><div><strong>AI Safety Investigator</strong><small><ShieldCheck size={11} /> Read-only · snapshot-bound</small></div>{onToggleExpanded && <button className="agent-expand" onClick={onToggleExpanded} aria-label={expanded ? 'Return investigator to split view' : 'Expand investigator to full workspace'}>{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}<span>{expanded ? 'Split view' : 'AI workspace'}</span></button>}<span className="agent-live">LIVE</span></div>
    <div className="agent-scope"><span>STUDY</span><b>{study.id}</b><span>SNAPSHOT</span><b>{study.snapshotId}</b></div>
    <div className="agent-conversation">
      <div className="agent-dialogue">
        <div className="chat-user">{question}</div>
        <div className="chat-agent">
          <div className="chat-agent-label"><Bot size={13} /> Investigation</div>
          {!enabled ? <p>This semantic profile is not authorized to run the AI evidence investigator.</p> : error ? <p>{error}</p> : busy ? <div className="thinking"><i /><i /><i /> Planning governed retrieval…</div> : result ? <>
            <p>{result.answer}</p>
            <div className="agent-citations">{result.citations.map((citation) => <button key={citation.sourceRef} title={`${citation.detail} · ${citation.sourceRef}`} onClick={onShowSource}>{citation.domain} · {citation.label}</button>)}</div>
            {semanticSearch?.hits.length ? <button className="meaning-link" onClick={() => onOpenSemantic?.(semanticObjectForHit(semanticSearch.hits[0], runtime))}><Braces size={12} /> Explore the governing meaning</button> : null}
          </> : <p>Select a suggested investigation or ask your own question. I will combine exact study queries, semantic evidence, graph expansion and citations.</p>}
        </div>
        {result && !expanded && <div className="agent-plan"><div className="agent-plan-title">Executed plan <span>{result.execution?.resolverId || result.provider}</span></div>{result.steps.map((step) => <div className="agent-step" key={step.id}><span className={`step-dot ${step.status}`} /><div><b>{step.label}</b><small>{step.detail}</small></div></div>)}</div>}
      </div>

      {expanded && result && evidence && runtime && <div className="agent-visual-canvas">
        <section className="agent-viz-card agent-dose-widget"><header><span><Activity size={14} /><b>Dose-response evidence</b></span><em>MI + DM + TX</em></header><DoseResponseChart signal={signal} groups={evidence.doseGroups} /></section>
        {lab && <section className="agent-viz-card agent-lab-widget"><header><span><Activity size={14} /><b>{lab.label} trajectory</b></span><em>LB + DM + TX</em></header><LabTrajectoryChart series={lab} /></section>}
        <section className="agent-viz-card agent-semantic-widget">
          <header><span><Braces size={14} /><b>{result.confidence === 'strong-pattern' ? 'Semantic grounding' : 'Clarify the intended meaning'}</b></span><em>{semanticSearch?.mode || 'compiled map'}</em></header>
          <div className="semantic-hierarchy"><span>Evidence</span><ChevronRight size={11} />{findingConcepts.slice(0, 3).map((concept) => <span key={concept.id}>{concept.label}</span>)}</div>
          <div className="meaning-results">{semanticSearch?.hits.slice(0, 5).map((hit) => <button className={selectedMeaning?.resourceId === hit.resourceId ? 'active' : ''} key={`${hit.resourceType}:${hit.resourceId}`} onClick={() => setSelectedMeaningId(hit.resourceId)}><i>{hit.resourceType}</i><span><b>{hit.label}</b><small>{hit.lanes.join(' + ')} · {hit.score}</small></span></button>)}</div>
          {selectedMeaning && <div className="meaning-inspector"><p>{selectedMeaning.excerpt}</p><div><button onClick={() => askWithMeaning(selectedMeaning)}><Sparkles size={11} /> Ask using this meaning</button><button onClick={() => onOpenSemantic?.(semanticObjectForHit(selectedMeaning, runtime))}><Braces size={11} /> Open in semantic map</button></div></div>}
          <div className="value-set-strip">{findingValueSets.map((valueSet) => <article key={valueSet.id}><b>{valueSet.label}</b><small>{valueSet.authority} · {valueSet.version}</small><div>{valueSet.values.slice(0, 6).map((value) => <button key={value} onClick={() => setQuestion(`Does “${value}” mean the intended ${valueSet.binding} for this investigation?`)}>{value}</button>)}</div></article>)}</div>
          {semanticSearch && <div className="semantic-execution-mini"><span>{semanticSearch.releaseId}</span>{semanticSearch.stages.map((stage) => <i className={stage.status} title={stage.detail} key={stage.id}>{stage.id}</i>)}<em>{semanticSearch.managedEmbedding.vectorFieldInSourceDocument ? 'document vector' : 'Atlas-managed vector'}</em></div>}
        </section>
        <section className="agent-viz-card execution-contract-widget">
          <header><span><SearchCode size={14} /><b>Deterministic contract &amp; executed plan</b></span><em>{result.execution?.semanticReleaseId || runtime.release.releaseId}</em></header>
          {result.execution && <><div className="contract-summary"><span><small>RESOLVER</small><b>{result.execution.resolverId}</b></span><span><small>CAPABILITY</small><b>{result.execution.capabilityId}</b></span><span><small>EXECUTOR</small><b>{result.execution.executor}</b></span></div><div className="query-scope"><code>{JSON.stringify(result.execution.queryShape.predicates)}</code><span>READ {result.execution.queryShape.readCollections.join(' · ')}<small>AUDIT WRITE {result.execution.queryShape.auditWriteCollection}</small></span></div></>}
          {result.execution && <div className="data-operation-list">{result.execution.dataOperations.map((operation) => <article key={operation.id}><span><Database size={11} /><b>{operation.collection}.{operation.operation}</b></span><code>{JSON.stringify(operation.predicate)}</code><em className={operation.status}>{operation.status} · {operation.resultCount} rows · {operation.durationMs} ms</em></article>)}</div>}
          <div className="executed-plan">{(result.execution?.executedStages || result.steps).map((step, index, steps) => <article key={step.id}><i className={step.status}>{index + 1}</i><div><b>{step.label}</b><small>{step.engine} · {step.status}</small><p>{step.detail}</p></div>{index < steps.length - 1 && <ChevronRight size={12} />}</article>)}</div>
          <footer><CheckCircle2 size={12} /> Bound to immutable evidence · {result.execution?.policies.join(' · ') || 'read-only'}</footer>
        </section>
        <section className="agent-viz-card agent-evidence-widget"><header><span><GitBranch size={14} /><b>Evidence topology</b></span><em>interactive</em></header><EvidenceGraph evidence={evidence} signal={signal} immersive /></section>
      </div>}
      {expanded && !result && <div className="agent-workspace-empty"><Sparkles size={26} /><h2>Ask a question to compose the investigation canvas.</h2><p>The investigator will select visual widgets, expose its deterministic resolver contract, and bind semantic ambiguities to the active Context Studio release.</p></div>}
    </div>
    <div className="agent-prompts">{prompts.map((prompt) => <button key={prompt} disabled={!enabled} onClick={() => ask(prompt)}>{prompt}<ChevronRight size={12} /></button>)}</div>
    <form className="agent-input" onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask(); }}><input disabled={!enabled} value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Ask the safety investigator" placeholder="Ask about dose, findings, labs, lineage, or meaning…" /><button disabled={busy || !enabled} aria-label="Send question"><Send size={15} /></button></form>
  </aside>;
}
