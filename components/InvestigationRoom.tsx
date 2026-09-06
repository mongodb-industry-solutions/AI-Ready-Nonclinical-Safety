'use client';

import { useEffect, useState } from 'react';
import { Activity, BookOpen, Bot, CheckCircle2, ChevronRight, Database, Download, LayoutDashboard, Network, Save, ShieldCheck, X } from 'lucide-react';
import type { CanonicalRecordPage, LiteratureDocument, LiteratureQueryExecution, RankedLiteratureDocument, ReviewActionRecord, SafetySignal, SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';
import AgentPanel from '@/components/AgentPanel';
import LiteratureEvidencePanel from '@/components/LiteratureEvidencePanel';
import RecordEvidencePanel from '@/components/RecordEvidencePanel';
import type { EvidenceDomain } from '@/components/EvidenceAssembly';
import EvidenceWorkspace, { type EvidenceWorkspacePreview } from '@/components/EvidenceWorkspace';
import MeasurementTrajectoryChart from '@/components/MeasurementTrajectoryChart';
import DoseResponseChart from '@/components/DoseResponseChart';
import LabTrajectoryChart from '@/components/LabTrajectoryChart';

export type InvestigationCanvas = 'assistant' | 'workspace' | 'records' | 'literature' | 'semantics' | 'coherence' | 'evidence' | 'dose';
type EvidenceContextStep = 'study' | 'treatment' | 'subject' | 'finding' | 'laboratory' | 'artifact';
type ContextPreview = EvidenceWorkspacePreview
  | { title: string; detail: string; document: RankedLiteratureDocument; execution: LiteratureQueryExecution | null }
  | { title: string; detail: string; widget: 'dose-response' | 'laboratory-trajectory' };

function stepForDomain(domain?: EvidenceDomain): EvidenceContextStep {
  if (domain === 'TX') return 'treatment';
  if (domain === 'DM') return 'subject';
  if (domain === 'LB') return 'laboratory';
  return 'finding';
}

export default function InvestigationRoom({ evidence, signal, runtime, literature, initialCanvas = 'assistant', recordFocus, onClose, onOpenSemantic, onOpenPortfolio }: { evidence: StudyEvidence; signal: SafetySignal; runtime: SemanticRuntimeView; literature: LiteratureDocument[]; initialCanvas?: InvestigationCanvas; recordFocus?: EvidenceDomain; onClose: () => void; onOpenSemantic: (focusId?: string) => void; onOpenPortfolio: () => void }) {
  const [canvas, setCanvas] = useState<InvestigationCanvas>(initialCanvas);
  const [contextStep, setContextStep] = useState<EvidenceContextStep>(stepForDomain(recordFocus));
  const [recordDomain, setRecordDomain] = useState<EvidenceDomain | undefined>(recordFocus);
  const [recordFilter, setRecordFilter] = useState<CanonicalRecordPage['filter']>('all');
  const [recordScopeOverride, setRecordScopeOverride] = useState<'subject' | 'study'>();
  const [recordTestCode, setRecordTestCode] = useState<string>();
  const [recordSourceIds, setRecordSourceIds] = useState<string[]>([]);
  const [action, setAction] = useState(runtime.actions[0]?.id || 'annotate');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<ReviewActionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ContextPreview>();
  const lab = signal.correlatedLab ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  // The path names the identities actually bound to this investigation, not the
  // generic classes, so the chain reads as a traversable evidence route.
  const strongestTreatedGroup = evidence.doseGroups
    .map((group, index) => ({
      group,
      affected: signal.incidence[index] || 0,
      rate: group.animalCount ? (signal.incidence[index] || 0) / group.animalCount : 0,
    }))
    .filter((entry) => entry.group.dose > 0)
    .sort((left, right) => right.rate - left.rate || right.group.dose - left.group.dose)[0];
  const contextNodes: Array<{ id: EvidenceContextStep; label: string; detail: string }> = [
    { id: 'study', label: evidence.study.id, detail: `${evidence.study.implementationGuide} · ${evidence.study.snapshotId}` },
    {
      id: 'treatment',
      label: `${evidence.doseGroups.length} treatment groups`,
      detail: strongestTreatedGroup
        ? `Highest observed treated incidence: ${strongestTreatedGroup.group.dose} ${strongestTreatedGroup.group.unit} · ${strongestTreatedGroup.affected}/${strongestTreatedGroup.group.animalCount}`
        : 'TX trial sets',
    },
    { id: 'subject', label: `${signal.affectedAnimals} of ${signal.totalAnimals} animals`, detail: `${evidence.study.species || 'subjects'} · DM + TX` },
    { id: 'finding', label: signal.organ, detail: signal.finding },
    signal.correlatedLab
      ? { id: 'laboratory', label: signal.correlatedLab, detail: `${lab?.label || 'Laboratory series'} · LB` }
      : { id: 'artifact', label: 'Source artifact', detail: 'XPT + Define-XML · SHA-256' },
  ];

  function navigateContext(step: EvidenceContextStep) {
    setContextStep(step);
    setRecordDomain(step === 'treatment' ? 'TX' : step === 'subject' ? 'DM' : step === 'laboratory' ? 'LB' : step === 'finding' ? 'MI' : undefined);
    setRecordFilter('all');
    setRecordScopeOverride(undefined);
    setRecordTestCode(undefined);
    setRecordSourceIds([]);
    setCanvas('records');
  }

  function navigateCanvas(next: InvestigationCanvas) {
    setCanvas(next);
    setPreview(undefined);
    if (next === 'workspace' || next === 'evidence' || next === 'coherence' || next === 'semantics' || next === 'assistant') setContextStep('finding');
    else if (next === 'dose') setContextStep(signal.correlatedLab ? 'laboratory' : 'treatment');
    else if (next === 'literature') setContextStep('artifact');
    else setContextStep(stepForDomain(recordFocus));
  }

  const defaultRecordContext: { scope: 'subject' | 'study'; domain?: EvidenceDomain; section?: 'records' | 'artifacts' } = contextStep === 'study' ? { scope: 'study' as const }
    : contextStep === 'treatment' ? { scope: 'study' as const, domain: 'TX' as EvidenceDomain }
      : contextStep === 'subject' ? { scope: 'subject' as const, domain: 'DM' as EvidenceDomain }
        : contextStep === 'laboratory' ? { scope: 'subject' as const, domain: 'LB' as EvidenceDomain }
          : contextStep === 'artifact' ? { scope: 'study' as const, section: 'artifacts' as const }
          : { scope: 'subject' as const, domain: recordDomain || 'MI' as EvidenceDomain };
  const recordContext = { ...defaultRecordContext, ...(recordScopeOverride ? { scope: recordScopeOverride } : {}) };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function commitReview() {
    if (note.trim().length < 3) return;
    setBusy(true);
    try {
      const response = await fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studyId: evidence.study.id, snapshotId: evidence.study.snapshotId, signalId: signal.id, profile: runtime.activeProfile.id, action, note }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Review action failed');
      setSaved(result.record);
      setNote('');
    } finally { setBusy(false); }
  }

  function exportBrief() {
    const brief = { generatedAt: new Date().toISOString(), study: evidence.study, finding: signal, semanticRelease: runtime.release.releaseId, reviewerProfile: runtime.activeProfile.id, review: saved, governance: runtime.governance.rules };
    const url = URL.createObjectURL(new Blob([JSON.stringify(brief, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${evidence.study.id}-${signal.id}-evidence-brief.json`; link.click(); URL.revokeObjectURL(url);
  }

  function showSource(domain: EvidenceDomain, sourceRecordIds: string[] = [], testCode?: string) {
    setPreview(undefined);
    setRecordDomain(domain);
    setRecordFilter(sourceRecordIds.length ? 'source-records' : 'all');
    setRecordScopeOverride('study');
    setRecordTestCode(testCode);
    setRecordSourceIds(sourceRecordIds);
    setContextStep(stepForDomain(domain));
    setCanvas('records');
  }

  const activeCanvas = canvas === 'coherence' || canvas === 'evidence' || canvas === 'dose' ? 'workspace' : canvas;

  return <div className="investigation-room" data-sherpa-state="investigation-room" role="dialog" aria-modal="true" aria-label="AI safety investigation room">
    <header className="room-header">
      <div className="room-title"><span><Bot size={18} /></span><div><nav className="room-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={onClose}><LayoutDashboard size={11} /> Study workspace</button><ChevronRight size={11} /><em>Investigation room</em></nav><strong>{signal.organ} · {signal.finding}</strong></div></div>
      <div className="room-state"><ShieldCheck size={14} /><span>Snapshot-bound</span><i /> <Network size={14} /><span>{runtime.activeProfile.label}</span><i /><span>{runtime.release.version}</span></div>
      <button className="secondary-action" onClick={exportBrief}><Download size={14} /> Export brief</button><button className="icon-button" aria-label="Close investigation room and return to study workspace" title="Return to study workspace" onClick={onClose}><X size={17} /></button>
    </header>
    <div className={`room-body room-body-feed ${preview ? 'inspector-open' : ''}`}>
      <aside className="room-context">
        <span className="panel-kicker">Investigation navigator</span><h2>Evidence path</h2><p className="context-guidance">Select a node to inspect that layer of the governed evidence chain.</p>
        <div className="context-score"><strong>{signal.affectedAnimals}/{signal.totalAnimals}</strong><span>affected animals</span><em>{signal.pattern}</em></div>
        <div className="context-chain">{contextNodes.map((item, index) => <button key={item.id} className={contextStep === item.id ? 'active' : ''} aria-current={contextStep === item.id ? 'step' : undefined} onClick={() => navigateContext(item.id)}><i>{index + 1}</i><span><b>{item.label}</b><small>{item.detail}</small></span></button>)}</div>
        <div className="semantic-policy"><b>Semantic policy</b>{runtime.governance.rules.slice(0, 3).map((rule) => <p key={rule}><CheckCircle2 size={11} />{rule}</p>)}</div>
        <div className="live-contract"><Activity size={13} /><span><b>Change Stream ready</b><small>Snapshot + cursor + typed events</small></span></div>
      </aside>
      <main className="room-stage">
        <nav className="room-tabs"><button className={activeCanvas === 'assistant' ? 'active' : ''} onClick={() => navigateCanvas('assistant')}><Bot size={14} /> Investigator</button><button className={activeCanvas === 'workspace' ? 'active' : ''} onClick={() => navigateCanvas('workspace')}><Activity size={14} /> Evidence workspace</button><button className={activeCanvas === 'records' ? 'active' : ''} onClick={() => navigateCanvas('records')}><Database size={14} /> Source records</button><button className={activeCanvas === 'literature' ? 'active' : ''} onClick={() => navigateCanvas('literature')}><BookOpen size={14} /> Literature <em>{literature.length}</em></button><button className={activeCanvas === 'semantics' ? 'active' : ''} onClick={() => navigateCanvas('semantics')}><Network size={14} /> Semantic plan</button></nav>
        <section className="room-widget">
          {activeCanvas === 'assistant' && <AgentPanel study={evidence.study} signal={signal} profileId={runtime.activeProfile.id} evidence={evidence} runtime={runtime} expanded onShowSource={() => showSource('MI')} onOpenCoherence={() => navigateCanvas('workspace')} onOpenLiterature={() => navigateCanvas('literature')} onOpenPortfolio={onOpenPortfolio} onOpenSemantic={onOpenSemantic} onInspectWidget={(widget) => setPreview(widget === 'dose-response' ? { title: 'Dose-response evidence', detail: 'Microscopic finding incidence across administered-dose groups · MI + DM + TX', widget } : { title: lab?.label || 'Laboratory trajectory', detail: 'Longitudinal laboratory context by treatment group · LB + DM + TX', widget })} />}
          {activeCanvas === 'workspace' && <EvidenceWorkspace evidence={evidence} signal={signal} profileId={runtime.activeProfile.id} runtime={runtime} onShowSource={showSource} onInspect={setPreview} onOpenSemantic={onOpenSemantic} />}
          {activeCanvas === 'records' && <RecordEvidencePanel key={`${contextStep}:${recordContext.domain || ''}:${recordFilter}:${recordContext.scope}:${recordTestCode || ''}:${recordSourceIds.join(',')}`} study={evidence.study} doseGroups={evidence.doseGroups} signal={signal} focusDomain={recordContext.domain} initialScope={recordContext.scope} initialSection={recordContext.section} initialFilter={recordFilter} initialTestCode={recordTestCode} initialSourceRecordIds={recordSourceIds} />}
          {activeCanvas === 'literature' && <LiteratureEvidencePanel signal={signal} documents={literature} profileId={runtime.activeProfile.id} onOpenDocument={(document, execution) => setPreview({ title: document.title, detail: `${document.journal} · ${document.year} · PMID ${document.pmid}`, document, execution })} />}
          {canvas === 'semantics' && <div className="resolver-board"><header><span className="panel-kicker">Compiled resolver graph</span><h2>Authorized tools for {runtime.activeProfile.label}</h2></header>{runtime.capabilities.map((capability, index) => <article key={capability.id}><i>{index + 1}</i><div><b>{capability.label}</b><p>{capability.description}</p><span>{capability.engines.join(' + ')}</span></div></article>)}</div>}
        </section>
        {activeCanvas !== 'assistant' && <section className="review-console">
          <div><span className="panel-kicker">Governed expert write</span><h3>Record a review decision</h3><p>Writes are appended to <code>review_actions</code>; published SEND evidence remains immutable.</p></div>
          {runtime.actions.length ? <><select value={action} onChange={(event) => setAction(event.target.value)}>{runtime.actions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add rationale, interpretation, or follow-up…" /><button className="primary-action" disabled={busy || note.trim().length < 3} onClick={commitReview}><Save size={14} /> {busy ? 'Validating…' : 'Commit governed action'}</button></> : <div className="read-only-profile"><ShieldCheck size={14} /> This profile is read-only.</div>}
          {saved && <div className="saved-action"><CheckCircle2 size={14} /><span><b>{saved.status}</b><small>{saved.id}</small></span></div>}
        </section>}
      </main>
      {preview && <aside className="room-inspector"><header><div><span className="panel-kicker">Context inspector</span><h3>{preview.title}</h3><p>{preview.detail}</p></div><button className="icon-button" onClick={() => setPreview(undefined)} aria-label="Close inspector"><X size={15} /></button></header>{'series' in preview ? <><MeasurementTrajectoryChart series={preview.series} endpoints={preview.endpoints} height={420} onSelectPoint={(point) => showSource(point.domain as EvidenceDomain, point.sourceRecordIds, point.testCode)} /><button className="inspector-source-action" onClick={() => showSource(preview.domain, [], preview.series[0]?.testCode)}><Database size={13} /> Browse supporting canonical rows</button></> : 'document' in preview ? <article className="literature-inspector"><span>{preview.document.evidenceRole}</span><h3>{preview.document.title}</h3><p>{preview.document.authors.join(', ')}</p><blockquote>{preview.document.relevance}</blockquote><div>{preview.document.concepts.map((concept) => <i key={concept}>{concept}</i>)}</div><a href={preview.document.url} target="_blank" rel="noreferrer">Open PubMed record</a><small>{preview.execution?.mode || 'curated evidence'} · contextual evidence, not causal proof</small></article> : <div className="agent-widget-inspector">{preview.widget === 'dose-response' ? <DoseResponseChart signal={signal} groups={evidence.doseGroups} /> : lab ? <LabTrajectoryChart series={lab} /> : <p>No laboratory trajectory is bound to this finding.</p>}<button className="inspector-source-action" onClick={() => showSource(preview.widget === 'dose-response' ? 'MI' : 'LB')}><Database size={13} /> Open supporting canonical rows</button></div>}</aside>}
    </div>
  </div>;
}
