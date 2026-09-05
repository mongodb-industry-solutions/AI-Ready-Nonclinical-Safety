'use client';

import { useEffect, useState } from 'react';
import { Activity, BookOpen, Bot, CheckCircle2, ChevronRight, Database, Download, GitBranch, LayoutDashboard, Network, Save, ShieldCheck, X } from 'lucide-react';
import type { LiteratureDocument, ReviewActionRecord, SafetySignal, SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';
import AgentPanel from '@/components/AgentPanel';
import DoseResponseChart from '@/components/DoseResponseChart';
import EvidenceGraph from '@/components/EvidenceGraph';
import LabTrajectoryChart from '@/components/LabTrajectoryChart';
import LiteratureEvidencePanel from '@/components/LiteratureEvidencePanel';
import RecordEvidencePanel from '@/components/RecordEvidencePanel';
import type { EvidenceDomain } from '@/components/EvidenceAssembly';

export type InvestigationCanvas = 'evidence' | 'records' | 'dose' | 'literature' | 'semantics';
type EvidenceContextStep = 'study' | 'treatment' | 'subject' | 'finding' | 'laboratory' | 'artifact';

function stepForDomain(domain?: EvidenceDomain): EvidenceContextStep {
  if (domain === 'TX') return 'treatment';
  if (domain === 'DM') return 'subject';
  if (domain === 'LB') return 'laboratory';
  return 'finding';
}

export default function InvestigationRoom({ evidence, signal, runtime, literature, initialCanvas = 'evidence', recordFocus, onClose, onOpenSemantic }: { evidence: StudyEvidence; signal: SafetySignal; runtime: SemanticRuntimeView; literature: LiteratureDocument[]; initialCanvas?: InvestigationCanvas; recordFocus?: EvidenceDomain; onClose: () => void; onOpenSemantic: (focusId?: string) => void }) {
  const [canvas, setCanvas] = useState<InvestigationCanvas>(initialCanvas);
  const [contextStep, setContextStep] = useState<EvidenceContextStep>(stepForDomain(recordFocus));
  const [action, setAction] = useState(runtime.actions[0]?.id || 'annotate');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<ReviewActionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [investigatorExpanded, setInvestigatorExpanded] = useState(false);
  const lab = signal.correlatedLab ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  const contextNodes: Array<{ id: EvidenceContextStep; label: string }> = [
    { id: 'study', label: 'Study' },
    { id: 'treatment', label: 'Treatment group' },
    { id: 'subject', label: 'Subject' },
    { id: 'finding', label: 'Finding' },
    signal.correlatedLab ? { id: 'laboratory', label: 'Lab measurement' } : { id: 'artifact', label: 'Source artifact' },
  ];

  function navigateContext(step: EvidenceContextStep) {
    setInvestigatorExpanded(false);
    setContextStep(step);
    setCanvas('records');
  }

  function navigateCanvas(next: InvestigationCanvas) {
    setCanvas(next);
    if (next === 'evidence' || next === 'semantics') setContextStep('finding');
    else if (next === 'dose') setContextStep(signal.correlatedLab ? 'laboratory' : 'treatment');
    else if (next === 'literature') setContextStep('artifact');
    else setContextStep(stepForDomain(recordFocus));
  }

  const recordContext: { scope: 'subject' | 'study'; domain?: EvidenceDomain; section?: 'records' | 'artifacts' } = contextStep === 'study' ? { scope: 'study' as const }
    : contextStep === 'treatment' ? { scope: 'study' as const, domain: 'TX' as EvidenceDomain }
      : contextStep === 'subject' ? { scope: 'subject' as const, domain: 'DM' as EvidenceDomain }
        : contextStep === 'laboratory' ? { scope: 'subject' as const, domain: 'LB' as EvidenceDomain }
          : contextStep === 'artifact' ? { scope: 'study' as const, section: 'artifacts' as const }
            : { scope: 'subject' as const, domain: 'MI' as EvidenceDomain };

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

  return <div className={`investigation-room ${investigatorExpanded ? 'investigator-focus' : ''}`} role="dialog" aria-modal="true" aria-label="AI safety investigation room">
    <header className="room-header">
      <div className="room-title"><span><Bot size={18} /></span><div><nav className="room-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={onClose}><LayoutDashboard size={11} /> Study workspace</button><ChevronRight size={11} /><em>Investigation room</em></nav><strong>{signal.organ} · {signal.finding}</strong></div></div>
      <div className="room-state"><ShieldCheck size={14} /><span>Snapshot-bound</span><i /> <Network size={14} /><span>{runtime.activeProfile.label}</span><i /><span>{runtime.release.version}</span></div>
      <button className="secondary-action" onClick={exportBrief}><Download size={14} /> Export brief</button><button className="icon-button" aria-label="Close investigation room and return to study workspace" title="Return to study workspace" onClick={onClose}><X size={17} /></button>
    </header>
    <div className="room-body">
      <aside className="room-context">
        <span className="panel-kicker">Investigation navigator</span><h2>Evidence path</h2><p className="context-guidance">Select a node to inspect that layer of the governed evidence chain.</p>
        <div className="context-score"><strong>{signal.affectedAnimals}/{signal.totalAnimals}</strong><span>affected animals</span><em>{signal.pattern}</em></div>
        <div className="context-chain">{contextNodes.map((item, index) => <button key={item.id} className={contextStep === item.id ? 'active' : ''} aria-current={contextStep === item.id ? 'step' : undefined} onClick={() => navigateContext(item.id)}><i>{index + 1}</i><span>{item.label}</span></button>)}</div>
        <div className="semantic-policy"><b>Semantic policy</b>{runtime.governance.rules.slice(0, 3).map((rule) => <p key={rule}><CheckCircle2 size={11} />{rule}</p>)}</div>
        <div className="live-contract"><Activity size={13} /><span><b>Change Stream ready</b><small>Snapshot + cursor + typed events</small></span></div>
      </aside>
      <main className="room-stage">
        <nav className="room-tabs"><button className={canvas === 'evidence' ? 'active' : ''} onClick={() => navigateCanvas('evidence')}><GitBranch size={14} /> Evidence network</button><button className={canvas === 'records' ? 'active' : ''} onClick={() => navigateCanvas('records')}><Database size={14} /> Source records</button><button className={canvas === 'dose' ? 'active' : ''} onClick={() => navigateCanvas('dose')}><Activity size={14} /> Dose & lab response</button><button className={canvas === 'literature' ? 'active' : ''} onClick={() => navigateCanvas('literature')}><BookOpen size={14} /> Literature evidence <em>{literature.length}</em></button><button className={canvas === 'semantics' ? 'active' : ''} onClick={() => navigateCanvas('semantics')}><Network size={14} /> Agent plan</button></nav>
        <section className="room-widget">
          {canvas === 'evidence' && <EvidenceGraph evidence={evidence} signal={signal} immersive />}
          {canvas === 'records' && <RecordEvidencePanel key={contextStep} study={evidence.study} doseGroups={evidence.doseGroups} signal={signal} focusDomain={recordContext.domain} initialScope={recordContext.scope} initialSection={recordContext.section} />}
          {canvas === 'dose' && <div className="room-charts"><div><span className="panel-kicker">Finding incidence</span><DoseResponseChart signal={signal} groups={evidence.doseGroups} /></div>{lab ? <div><span className="panel-kicker">{lab.label} trajectory</span><LabTrajectoryChart series={lab} /></div> : <div className="no-lab-context"><Activity size={23} /><div><b>No asserted laboratory correlate</b><p>The evidence graph does not create an LB relationship where none is governed.</p></div></div>}</div>}
          {canvas === 'literature' && <LiteratureEvidencePanel signal={signal} documents={literature} profileId={runtime.activeProfile.id} />}
          {canvas === 'semantics' && <div className="resolver-board"><header><span className="panel-kicker">Compiled resolver graph</span><h2>Authorized tools for {runtime.activeProfile.label}</h2></header>{runtime.capabilities.map((capability, index) => <article key={capability.id}><i>{index + 1}</i><div><b>{capability.label}</b><p>{capability.description}</p><span>{capability.engines.join(' + ')}</span></div></article>)}</div>}
        </section>
        <section className="review-console">
          <div><span className="panel-kicker">Governed expert write</span><h3>Record a review decision</h3><p>Writes are appended to <code>review_actions</code>; published SEND evidence remains immutable.</p></div>
          {runtime.actions.length ? <><select value={action} onChange={(event) => setAction(event.target.value)}>{runtime.actions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add rationale, interpretation, or follow-up…" /><button className="primary-action" disabled={busy || note.trim().length < 3} onClick={commitReview}><Save size={14} /> {busy ? 'Validating…' : 'Commit governed action'}</button></> : <div className="read-only-profile"><ShieldCheck size={14} /> This profile is read-only.</div>}
          {saved && <div className="saved-action"><CheckCircle2 size={14} /><span><b>{saved.status}</b><small>{saved.id}</small></span></div>}
        </section>
      </main>
      <AgentPanel study={evidence.study} signal={signal} profileId={runtime.activeProfile.id} evidence={evidence} runtime={runtime} expanded={investigatorExpanded} onToggleExpanded={() => setInvestigatorExpanded((expanded) => !expanded)} onShowSource={() => { setInvestigatorExpanded(false); setContextStep('subject'); setCanvas('records'); }} onOpenSemantic={onOpenSemantic} />
    </div>
  </div>;
}
