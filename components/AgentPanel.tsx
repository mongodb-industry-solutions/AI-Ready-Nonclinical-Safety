'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, BookOpen, Bot, Braces, CheckCircle2, ChevronRight, Database, GitBranch, GitCompareArrows, Maximize2, Minimize2, SearchCode, Send, ShieldCheck, Sparkles } from 'lucide-react';
import type { InvestigationResult, LiteratureQueryExecution, RankedLiteratureDocument, SafetySignal, SemanticGroundingResult, SemanticProfileId, SemanticRuntimeView, StudyEvidence, StudySummary } from '@/lib/contracts';
import DoseResponseChart from '@/components/DoseResponseChart';
import EvidenceGraph from '@/components/EvidenceGraph';
import LabTrajectoryChart from '@/components/LabTrajectoryChart';

const prompts = [
  'Establish the observed dose-response and tell me what is known versus uncertain.',
  'Using our previous findings, which body-weight, food, clinical, organ-weight, laboratory, and exposure evidence supports or challenges the hypothesis?',
  'Now retrieve relevant literature and similar observed findings, keeping external context separate from this study.',
  'Using the complete investigation so far, prepare a balanced evidence brief and show exactly how it was queried.',
];

type ConversationTurn = { id: string; question: string; result: InvestigationResult };

function answerInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function AssistantAnswer({ text }: { text: string }) {
  return <div className="agent-answer">{text.split(/\n{2,}/).filter(Boolean).map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const heading = lines[0]?.match(/^#{1,4}\s+(.+)$/);
    if (heading) return <section key={index}><h4>{answerInline(heading[1])}</h4>{lines.slice(1).map((line, lineIndex) => <p key={lineIndex}>{answerInline(line)}</p>)}</section>;
    if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{answerInline(line.replace(/^[-*]\s+/, ''))}</li>)}</ul>;
    if (lines.every((line) => /^\d+[.)]\s+/.test(line))) return <ol key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{answerInline(line.replace(/^\d+[.)]\s+/, ''))}</li>)}</ol>;
    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{answerInline(line)}{lineIndex < lines.length - 1 && <br />}</span>)}</p>;
  })}</div>;
}

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
  onOpenCoherence?: () => void;
  onOpenLiterature?: () => void;
  onOpenPortfolio?: () => void;
  onOpenSemantic?: (focusId?: string) => void;
  onInspectLiterature?: (document: RankedLiteratureDocument, execution: LiteratureQueryExecution | null) => void;
  onInspectWidget?: (widget: 'dose-response' | 'laboratory-trajectory') => void;
}

function semanticObjectForHit(hit: SemanticGroundingResult['hits'][number], runtime?: SemanticRuntimeView): string | undefined {
  if (hit.resourceType === 'object') return hit.resourceId;
  if (hit.resourceType === 'valueSet') return runtime?.valueSets.find((item) => item.id === hit.resourceId)?.binding.split('.')[0];
  if (hit.resourceType === 'concept') return runtime?.taxonomy.concepts.find((item) => item.id === hit.resourceId)?.semanticObjects[0];
  if (hit.resourceType === 'archetype') return runtime?.archetypes.find((item) => item.id === hit.resourceId)?.members[0]?.semanticObject;
  if (hit.resourceType === 'storageBinding') return runtime?.storageBindings.find((item) => item.id === hit.resourceId)?.semanticObject;
  return undefined;
}

export default function AgentPanel({ study, signal, profileId = 'toxicologist', enabled = true, id, evidence, runtime, expanded = false, onToggleExpanded, onShowSource, onOpenCoherence, onOpenLiterature, onOpenPortfolio, onOpenSemantic, onInspectLiterature, onInspectWidget }: AgentPanelProps) {
  const [question, setQuestion] = useState(prompts[0]);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const sessionId = useRef('');
  const [semanticSearch, setSemanticSearch] = useState<SemanticGroundingResult | null>(null);
  const [selectedMeaningId, setSelectedMeaningId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lab = signal.correlatedLab && evidence ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  const findingConcepts = useMemo(() => runtime?.taxonomy.concepts.filter((concept) => concept.semanticObjects.includes('Finding')) || [], [runtime]);
  const findingValueSets = useMemo(() => runtime?.valueSets.filter((valueSet) => valueSet.binding.startsWith('Finding.')) || [], [runtime]);
  const selectedMeaning = semanticSearch?.hits.find((hit) => hit.resourceId === selectedMeaningId) || semanticSearch?.hits[0];
  const widgetOrder = useMemo(() => new Map((result?.widgets || []).map((widget, index) => [widget.kind, index])), [result?.widgets]);
  const coherenceIncidence = useMemo(() => {
    const totals = new Map<number, { affected: number; examined: number }>();
    for (const endpoint of result?.coherence?.targetOrgan.endpointSummaries || []) {
      if (endpoint.domain !== 'MI' || endpoint.finding?.trim().toUpperCase() !== signal.finding.trim().toUpperCase() || endpoint.group?.dose === undefined || !endpoint.incidence) continue;
      const current = totals.get(endpoint.group.dose) || { affected: 0, examined: 0 };
      current.affected += endpoint.incidence.affected;
      current.examined += endpoint.incidence.examined;
      totals.set(endpoint.group.dose, current);
    }
    return [...totals.entries()].sort(([left], [right]) => left - right).map(([dose, value]) => ({ dose, ...value, rate: value.examined ? Math.round((value.affected / value.examined) * 100) : 0 }));
  }, [result?.coherence, signal.finding]);

  useEffect(() => {
    sessionId.current = `safety-${crypto.randomUUID()}`;
    setTurns([]);
    setResult(null);
    setSemanticSearch(null);
    setSelectedMeaningId(undefined);
  }, [study.id, study.snapshotId, signal.id, profileId]);

  async function ask(nextQuestion = question) {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    setQuestion(nextQuestion);
    try {
      if (!sessionId.current) sessionId.current = `safety-${crypto.randomUUID()}`;
      const response = await fetch('/api/investigations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studyId: study.id, signalId: signal.id, profileId, question: nextQuestion, sessionId: sessionId.current }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The investigation could not be authorized');
      const investigation = payload as InvestigationResult;
      sessionId.current = investigation.session.id;
      setResult(investigation);
      setTurns((current) => [...current, { id: `${investigation.session.id}:${investigation.session.turn}`, question: nextQuestion, result: investigation }]);
      setSemanticSearch(investigation.semanticGrounding || null);
      setSelectedMeaningId(investigation.semanticGrounding?.hits[0]?.resourceId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The investigation could not be authorized');
    } finally { setBusy(false); }
  }

  function askWithMeaning(hit: SemanticGroundingResult['hits'][number]) {
    void ask(`${question} Resolve the question using the governed ${hit.resourceType} “${hit.label}” (${hit.resourceId}) and state if that interpretation changes the conclusion.`);
  }

  function openCitation(domain: string, sourceRef: string) {
    if (domain === 'SEMANTIC') {
      const hit = semanticSearch?.hits.find((item) => item.sourceRef === sourceRef);
      onOpenSemantic?.(hit ? semanticObjectForHit(hit, runtime) : undefined);
    } else if (domain === 'LITERATURE') onOpenLiterature?.();
    else if (domain === 'PORTFOLIO') onOpenPortfolio?.();
    else onShowSource?.();
  }

  const previousTurns = busy ? turns : turns.slice(0, -1);
  const activeQuestion = busy ? question : turns.at(-1)?.question;

  return <aside className={`agent-panel ${expanded ? 'agent-panel-expanded' : ''}`} id={id}>
    <div className="agent-heading"><span className="agent-orb"><Sparkles size={17} /></span><div><strong>AI Safety Investigator</strong><small><ShieldCheck size={11} /> Read-only · snapshot-bound</small></div>{onToggleExpanded && <button className="agent-expand" onClick={onToggleExpanded} aria-label={expanded ? 'Return investigator to split view' : 'Expand investigator to full workspace'}>{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}<span>{expanded ? 'Split view' : 'AI workspace'}</span></button>}<span className={`agent-live ${result?.provider === 'magenta' ? 'agent-live-magenta' : result ? 'agent-live-deterministic' : ''}`} title={result ? (result.provider === 'magenta' ? 'Answered by the Magenta agent runtime' : 'Answered by the bundled deterministic investigator') : 'Run an investigation to see which execution path answers'}>{result ? (result.provider === 'magenta' ? 'MAGENTA' : 'DETERMINISTIC') : 'READY'}</span></div>
    <div className="agent-scope"><span>STUDY</span><b>{study.id}</b><span>SNAPSHOT</span><b>{study.snapshotId}</b><span>MEMORY</span><b>{turns.length ? `${turns.length} bound turn${turns.length === 1 ? '' : 's'} · ${result?.session.memory || 'session'}` : 'New scope-bound session'}</b></div>
    <div className="agent-conversation">
      <div className="agent-dialogue">
        {previousTurns.map((turn) => <article className="agent-memory-turn" key={turn.id}>
          <div className="chat-user">{turn.question}</div>
          <div className="chat-agent"><div className="chat-agent-label"><Bot size={13} /> Investigation · turn {turn.result.session.turn}</div><AssistantAnswer text={turn.result.answer} /><small>{turn.result.widgets.length} tool-selected visual{turn.result.widgets.length === 1 ? '' : 's'} · {turn.result.citations.length} citations</small></div>
        </article>)}
        {activeQuestion && <div className="chat-user">{activeQuestion}</div>}
        <div className="chat-agent">
          <div className="chat-agent-label"><Bot size={13} /> Investigation</div>
          {!enabled ? <p>This semantic profile is not authorized to run the AI evidence investigator.</p> : error ? <p>{error}</p> : busy ? <div className="thinking"><i /><i /><i /> Planning governed retrieval…</div> : result ? <>
            <AssistantAnswer text={result.answer} />
            <div className="agent-memory-proof"><ShieldCheck size={11} /><span>Turn {result.session.turn} · memory retained for intent · deterministic evidence rebound to this snapshot</span></div>
            <div className="agent-citations">{result.citations.map((citation, index) => <button key={`${citation.domain}:${citation.sourceRef}:${index}`} title={`${citation.detail} · ${citation.sourceRef}`} onClick={() => openCitation(citation.domain, citation.sourceRef)}>{citation.domain} · {citation.label}</button>)}</div>
            {semanticSearch?.hits.length ? <button className="meaning-link" onClick={() => onOpenSemantic?.(semanticObjectForHit(semanticSearch.hits[0], runtime))}><Braces size={12} /> Explore the governing meaning</button> : null}
          </> : <p>Select a suggested investigation or ask your own question. I will combine exact study queries, semantic evidence, graph expansion and citations.</p>}
        </div>
        {result?.provider === 'deterministic' && result.fallbackReason && !expanded && <p className="agent-fallback-note" role="status"><ShieldCheck size={12} /> <span><b>Deterministic investigator answered.</b> {result.fallbackReason}</span></p>}{result && !expanded && <div className="agent-plan"><div className="agent-plan-title">Executed plan <span>{result.execution?.resolverId || result.provider}</span></div>{result.steps.map((step) => <div className="agent-step" key={step.id}><span className={`step-dot ${step.status}`} /><div><b>{step.label}</b><small>{step.detail}</small></div></div>)}</div>}
        {expanded && result && <div className="agent-widget-receipt"><Sparkles size={12} /><span>{result.widgets.length ? `${result.widgets.length} visual${result.widgets.length === 1 ? '' : 's'} selected by ${result.widgets[0].trigger.source === 'magenta-tool' ? 'Magenta registered tooling' : 'the deterministic fallback policy'}` : 'No visual was requested for this turn'}</span></div>}
      </div>

      {expanded && result && evidence && runtime && <div className="agent-visual-canvas">
        {widgetOrder.has('dose-response') && <section style={{ order: widgetOrder.get('dose-response') }} className="agent-viz-card agent-dose-widget agent-expandable-widget" role={onInspectWidget ? 'button' : undefined} tabIndex={onInspectWidget ? 0 : undefined} aria-label={onInspectWidget ? 'Open dose-response chart in context inspector' : undefined} onClick={() => onInspectWidget?.('dose-response')} onKeyDown={(event) => { if (onInspectWidget && (event.key === 'Enter' || event.key === ' ')) onInspectWidget('dose-response'); }}><header><span><Activity size={14} /><b>Dose-response evidence</b></span><em>{onInspectWidget ? 'Click to inspect' : 'MI + DM + TX'}</em></header><DoseResponseChart signal={signal} groups={evidence.doseGroups} /></section>}
        {lab && widgetOrder.has('laboratory-trajectory') && <section style={{ order: widgetOrder.get('laboratory-trajectory') }} className="agent-viz-card agent-lab-widget agent-expandable-widget" role={onInspectWidget ? 'button' : undefined} tabIndex={onInspectWidget ? 0 : undefined} aria-label={onInspectWidget ? `Open ${lab.label} chart in context inspector` : undefined} onClick={() => onInspectWidget?.('laboratory-trajectory')} onKeyDown={(event) => { if (onInspectWidget && (event.key === 'Enter' || event.key === ' ')) onInspectWidget('laboratory-trajectory'); }}><header><span><Activity size={14} /><b>{lab.label} trajectory</b></span><em>{onInspectWidget ? 'Click to inspect' : 'LB + DM + TX'}</em></header><LabTrajectoryChart series={lab} /></section>}
        {result.coherence?.available && widgetOrder.has('biological-coherence') && <section style={{ order: widgetOrder.get('biological-coherence') }} className="agent-viz-card agent-coherence-widget">
          <header><span><MicroscopeIcon /><b>Biological coherence</b></span><em>{result.coherence.execution.resolverId}</em></header>
          <div className="agent-coherence-body">
            <div className="agent-incidence-mini">{coherenceIncidence.map((item) => <article key={item.dose}><div title={`${item.affected}/${item.examined} animals`}><i style={{ height: `${Math.max(item.rate, 2)}%` }} /></div><b>{item.rate}%</b><small>{item.dose} mg/kg</small></article>)}</div>
            <div className="agent-coherence-lanes">
              <span><b>{result.coherence.inventory.endpointSummaries}</b><small>target-organ endpoints</small></span>
              <span><b>{result.coherence.targetOrgan.measurementSeries.length}</b><small>organ measurement series</small></span>
              <span><b>{result.coherence.systemicContext.bodyWeightSeries.length}</b><small>body-weight series</small></span>
              <span><b>{result.coherence.systemicContext.exposureSeries.length}</b><small>exposure series</small></span>
            </div>
          </div>
          <footer><span><GitBranch size={12} /> {result.coherence.inventory.sourceDeclaredRelationships} source-declared links</span><span><CircleAlertIcon /> {result.coherence.systemicContext.laboratoryCoverage.sourceRangeSummaryCount ? 'Source ranges available' : 'No source laboratory ranges'}</span>{onOpenCoherence && <button onClick={onOpenCoherence}>Open full evidence <ChevronRight size={12} /></button>}</footer>
        </section>}
        {result.portfolioContext?.matches.length && widgetOrder.has('portfolio-context') ? <section style={{ order: widgetOrder.get('portfolio-context') }} className="agent-viz-card agent-portfolio-widget">
          <header><span><GitCompareArrows size={14} /><b>Cross-study context</b></span><em>{result.portfolioContext.execution.mode}</em></header>
          <div className="agent-portfolio-query"><span><small>QUERY FINDING</small><b>{result.portfolioContext.query.signal.organ} · {result.portfolioContext.query.signal.finding}</b></span><span><small>CORPUS</small><b>{result.portfolioContext.corpus.studies} studies · {result.portfolioContext.corpus.findings} findings</b></span></div>
          <div className="agent-portfolio-matches">{result.portfolioContext.matches.slice(0, 4).map((match) => <button key={match.id} onClick={onOpenPortfolio}>
            <span className="agent-match-rank">#{match.rank}</span><span><b>{match.study.id} · {match.signal.organ}</b><small>{match.signal.finding}</small></span>
            <span className="agent-match-lanes">{match.lanes.map((lane) => <i key={lane.id} title={lane.detail}><em>{lane.label}</em><span><b style={{ width: `${lane.score || 0}%` }} /></span></i>)}</span>
            <strong>{match.score}%</strong><ChevronRight size={12} />
          </button>)}</div>
          <div className="agent-comparability">{result.portfolioContext.matches[0]?.comparability.map((dimension) => <span className={dimension.status} title={dimension.detail} key={dimension.id}><i />{dimension.label}<b>{dimension.status}</b></span>)}</div>
          <footer><ShieldCheck size={12} /><span>{result.portfolioContext.execution.boundary}</span>{onOpenPortfolio && <button onClick={onOpenPortfolio}>Open similarity atlas <ChevronRight size={12} /></button>}</footer>
        </section> : null}
        {result.literatureEvidence?.documents.length && widgetOrder.has('literature-evidence') ? <section style={{ order: widgetOrder.get('literature-evidence') }} className="agent-viz-card agent-literature-widget">
          <header><span><BookOpen size={14} /><b>Literature evidence</b></span><em>{result.literatureEvidence.execution.mode}</em></header>
          <div className="agent-literature-list">{result.literatureEvidence.documents.slice(0, 4).map((document) => <button key={document.id} onClick={() => onInspectLiterature ? onInspectLiterature(document, result.literatureEvidence?.execution || null) : onOpenLiterature?.()}>
            <span><i>{document.evidenceRole}</i><b>{document.title}</b><small>{document.journal} · {document.year} · PMID {document.pmid}</small></span><strong>#{document.retrieval.rank}</strong><ChevronRight size={13} />
          </button>)}</div>
          <footer><ShieldCheck size={12} /> Contextual research evidence; never promoted to study observation.{onOpenLiterature && <button onClick={onOpenLiterature}>Browse literature <ChevronRight size={12} /></button>}</footer>
        </section> : null}
        {widgetOrder.has('semantic-grounding') && <section style={{ order: widgetOrder.get('semantic-grounding') }} className="agent-viz-card agent-semantic-widget">
          <header><span><Braces size={14} /><b>{result.confidence === 'strong-pattern' ? 'Semantic grounding' : 'Clarify the intended meaning'}</b></span><em>{semanticSearch?.mode || 'compiled map'}</em></header>
          <div className="semantic-hierarchy"><span>Evidence</span><ChevronRight size={11} />{findingConcepts.slice(0, 3).map((concept) => <span key={concept.id}>{concept.label}</span>)}</div>
          <div className="meaning-results">{semanticSearch?.hits.slice(0, 5).map((hit) => <button className={selectedMeaning?.resourceId === hit.resourceId ? 'active' : ''} key={`${hit.resourceType}:${hit.resourceId}`} onClick={() => setSelectedMeaningId(hit.resourceId)}><i>{hit.resourceType}</i><span><b>{hit.label}</b><small>{hit.lanes.join(' + ')} · {hit.score}</small></span></button>)}</div>
          {selectedMeaning && <div className="meaning-inspector"><p>{selectedMeaning.excerpt}</p><div><button onClick={() => askWithMeaning(selectedMeaning)}><Sparkles size={11} /> Ask using this meaning</button><button onClick={() => onOpenSemantic?.(semanticObjectForHit(selectedMeaning, runtime))}><Braces size={11} /> Open in semantic map</button></div></div>}
          <div className="value-set-strip">{findingValueSets.map((valueSet) => <article key={valueSet.id}><b>{valueSet.label}</b><small>{valueSet.authority} · {valueSet.version}</small><div>{valueSet.values.slice(0, 6).map((value) => <button key={value} onClick={() => setQuestion(`Does “${value}” mean the intended ${valueSet.binding} for this investigation?`)}>{value}</button>)}</div></article>)}</div>
          {semanticSearch && <div className="semantic-execution-mini"><span>{semanticSearch.releaseId}</span>{semanticSearch.stages.map((stage) => <i className={stage.status} title={stage.detail} key={stage.id}>{stage.id}</i>)}<em>{semanticSearch.managedEmbedding.vectorFieldInSourceDocument ? 'document vector' : 'Atlas-managed vector'}</em></div>}
        </section>}
        {widgetOrder.has('execution-plan') && <section style={{ order: widgetOrder.get('execution-plan') }} className="agent-viz-card execution-contract-widget">
          <header><span><SearchCode size={14} /><b>Deterministic contract &amp; executed plan</b></span><em>{result.execution?.semanticReleaseId || runtime.release.releaseId}</em></header>
          {result.execution && <><div className="contract-summary"><span><small>RESOLVER</small><b>{result.execution.resolverId}</b></span><span><small>CAPABILITY</small><b>{result.execution.capabilityId}</b></span><span><small>EXECUTOR</small><b>{result.execution.executor}</b></span></div><div className="query-scope"><code>{JSON.stringify(result.execution.queryShape.predicates)}</code><span>READ {result.execution.queryShape.readCollections.join(' · ')}<small>AUDIT WRITE {result.execution.queryShape.auditWriteCollection}</small></span></div></>}
          {result.execution && <div className="data-operation-list">{result.execution.dataOperations.map((operation) => <article key={operation.id}><span><Database size={11} /><b>{operation.collection}.{operation.operation}</b></span><code>{JSON.stringify(operation.predicate)}</code><em className={operation.status}>{operation.status} · {operation.resultCount} rows · {operation.durationMs} ms{operation.plan ? ` · ${operation.plan.documentsExamined ?? '—'} examined · ${operation.plan.indexes.join(', ') || 'COLLSCAN'}` : ''}</em></article>)}</div>}
          <div className="executed-plan">{(result.execution?.executedStages || result.steps).map((step, index, steps) => <article key={step.id}><i className={step.status}>{index + 1}</i><div><b>{step.label}</b><small>{step.engine} · {step.status}</small><p>{step.detail}</p></div>{index < steps.length - 1 && <ChevronRight size={12} />}</article>)}</div>
          <footer><CheckCircle2 size={12} /> Bound to immutable evidence · {result.execution?.policies.join(' · ') || 'read-only'}</footer>
        </section>}
        {widgetOrder.has('evidence-topology') && <section style={{ order: widgetOrder.get('evidence-topology') }} className="agent-viz-card agent-evidence-widget"><header><span><GitBranch size={14} /><b>Evidence topology</b></span><em>interactive</em></header><EvidenceGraph evidence={evidence} signal={signal} immersive /></section>}
      </div>}
      {expanded && !result && <div className="agent-workspace-empty"><Sparkles size={26} /><h2>Ask a question to compose the investigation canvas.</h2><p>The investigator will select visual widgets, expose its deterministic resolver contract, and bind semantic ambiguities to the active Context Studio release.</p></div>}
    </div>
    <div className="agent-prompts">{prompts.map((prompt, index) => <button key={prompt} disabled={!enabled || busy} onClick={() => ask(prompt)}><i>{index + 1}</i>{prompt}<ChevronRight size={12} /></button>)}</div>
    <form className="agent-input" onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask(); }}><input disabled={!enabled} value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Ask the safety investigator" placeholder="Ask about dose, findings, labs, lineage, or meaning…" /><button disabled={busy || !enabled} aria-label="Send question"><Send size={15} /></button></form>
  </aside>;
}

function MicroscopeIcon() {
  return <Activity size={14} />;
}

function CircleAlertIcon() {
  return <ShieldCheck size={12} />;
}
