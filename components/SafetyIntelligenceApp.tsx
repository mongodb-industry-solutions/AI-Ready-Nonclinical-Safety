'use client';

import { useMemo, useState } from 'react';
import { Activity, Bot, Braces, ChevronDown, CircleHelp, Database, Dna, Expand, FileCheck2, FlaskConical, GitBranch, Layers3, LayoutDashboard, Microscope, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import type { LiteratureDocument, SafetySignal, SemanticProfileId, SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';
import { reviewScore } from '@/lib/analysis/signal-engine';
import AgentPanel from '@/components/AgentPanel';
import DoseResponseChart from '@/components/DoseResponseChart';
import EvidenceGraph from '@/components/EvidenceGraph';
import LabTrajectoryChart from '@/components/LabTrajectoryChart';
import SignalMatrix from '@/components/SignalMatrix';
import SemanticModelExplorer from '@/components/SemanticModelExplorer';
import InvestigationRoom from '@/components/InvestigationRoom';
import AuditLineageView from '@/components/AuditLineageView';

type WorkspaceView = 'workspace' | 'semantics' | 'architecture' | 'audit';

function PriorityPill({ value }: { value: SafetySignal['reviewPriority'] }) {
  return <span className={`priority-pill priority-${value}`}>{value === 'high' ? 'review first' : value}</span>;
}

export default function SafetyIntelligenceApp({ evidence, initialSemantics, literature }: { evidence: StudyEvidence; initialSemantics: SemanticRuntimeView; literature: LiteratureDocument[] }) {
  const [view, setView] = useState<WorkspaceView>('workspace');
  const [selectedId, setSelectedId] = useState(evidence.signals[0].id);
  const [graphOpen, setGraphOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [semantics, setSemantics] = useState(initialSemantics);
  const signal = evidence.signals.find((item) => item.id === selectedId) || evidence.signals[0];
  const lab = signal.correlatedLab ? evidence.labSeries[signal.correlatedLab] : evidence.labSeries.LYM;
  const ranked = useMemo(() => evidence.signals.map((item) => ({ ...item, score: reviewScore(item, evidence.doseGroups) })).sort((a, b) => b.score - a.score), [evidence]);
  const canInvestigate = semantics.capabilities.some((item) => item.id === 'assemble-evidence-brief');
  const scrollToSection = (target: string) => {
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const openInvestigation = () => {
    if (!canInvestigate) return;
    setView('workspace');
    setRoomOpen(true);
  };
  const openView = (target: WorkspaceView) => {
    setRoomOpen(false);
    setView(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  async function changeProfile(profile: SemanticProfileId) {
    const response = await fetch(`/api/semantics?profile=${profile}`, { cache: 'no-store' });
    setSemantics(await response.json());
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Dna size={20} /></span><div><strong>Safety Intelligence</strong><small>MongoDB Solution Library</small></div></div>
      <div className="nav-label">Investigation</div>
      <nav>
        <button className={view === 'workspace' && !roomOpen ? 'active' : ''} onClick={() => openView('workspace')}><LayoutDashboard size={16} /><span>Study workspace</span></button>
        <button className={roomOpen ? 'active' : ''} disabled={!canInvestigate} title={canInvestigate ? undefined : 'The active semantic profile cannot run the AI investigator'} onClick={openInvestigation}><Sparkles size={16} /><span>Investigation room</span></button>
      </nav>
      <div className="nav-label">Platform</div>
      <nav><button onClick={() => openView('semantics')} className={view === 'semantics' ? 'active' : ''}><Braces size={16} /><span>Semantic model</span></button><button onClick={() => openView('architecture')} className={view === 'architecture' ? 'active' : ''}><Layers3 size={16} /><span>Data & AI architecture</span></button><button onClick={() => openView('audit')} className={view === 'audit' ? 'active' : ''}><FileCheck2 size={16} /><span>Audit & lineage</span></button></nav>
      <div className="source-card"><div><span className="status-dot" /> Published evidence</div><strong>{evidence.study.implementationGuide}</strong><small>Immutable · checksum verified</small></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <button className="study-switcher"><span className="study-icon"><FlaskConical size={16} /></span><span><b>{evidence.study.title}</b><small>{evidence.study.id} · {evidence.study.snapshotId}</small></span><ChevronDown size={14} /></button>
        <div className="global-search"><Search size={14} /><span>Search findings, animals, tests…</span><kbd>⌘ K</kbd></div>
        <span className="published"><ShieldCheck size={14} /> Published</span>
        <label className="profile-switcher"><UserRound size={13} /><select value={semantics.activeProfile.id} onChange={(event) => changeProfile(event.target.value as SemanticProfileId)}>{semantics.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
        <button className="icon-button"><CircleHelp size={17} /></button>
      </header>

      {view === 'architecture' ? <Architecture evidence={evidence} onBack={() => openView('workspace')} /> : view === 'semantics' ? <SemanticModelExplorer runtime={semantics} onRuntimeChange={setSemantics} /> : view === 'audit' ? <AuditLineageView evidence={evidence} runtime={semantics} canInvestigate={canInvestigate} onOpenInvestigation={openInvestigation} /> : <>
        <section className="hero-row" id="overview">
          <div><div className="eyebrow">Nonclinical safety review · public demonstration study</div><h1>Signal landscape</h1><p>Move from study-wide patterns to animal-level evidence, then ask an AI investigator to explain exactly what it checked.</p></div>
          <div className="hero-actions"><button className="secondary-action" onClick={() => scrollToSection('graph')}><GitBranch size={14} /> Evidence graph</button><button className="primary-action" disabled={!canInvestigate} title={canInvestigate ? undefined : 'The active semantic profile cannot run the AI investigator'} onClick={openInvestigation}><Sparkles size={14} /> Start investigation</button></div>
        </section>

        <section className="metric-row">
          <article><span>Canonical records</span><strong>{evidence.study.recordCount.toLocaleString()}</strong><small>across {evidence.study.domains.length} SEND domains</small></article>
          <article><span>Study animals</span><strong>{evidence.study.animalCount}</strong><small>5 treatment groups</small></article>
          <article><span>Microscopy records</span><strong>{evidence.study.domainCounts.MI}</strong><small>study day 30 review</small></article>
          <article className="accent-metric"><span>Top review signal</span><strong>{ranked[0].score}</strong><small>heuristic priority, not a conclusion</small></article>
        </section>

        <section className="panel matrix-panel" id="signals">
          <div className="panel-heading"><div><span className="panel-kicker">Study-wide visual triage</span><h2>Dose × organ signal matrix</h2><p>Scan every finding at once. Select a row to synchronize the charts, evidence graph, and AI investigator.</p></div><div className="matrix-callout"><Activity size={14} /><span><b>{ranked.filter((item) => item.reviewPriority === 'high').length}</b> priority signal</span></div></div>
          <SignalMatrix groups={evidence.doseGroups} signals={ranked} selectedId={signal.id} onSelect={setSelectedId} />
        </section>

        <div className="content-grid">
          <section className="analysis-column">
            <article className="panel signal-map-panel">
              <div className="panel-heading"><div><span className="panel-kicker">Organ signal map</span><h2>Findings ranked for review</h2></div><div className="legend"><span className="legend-high" /> treated-only <span className="legend-context" /> contextual</div></div>
              <div className="signal-landscape">
                <div className="body-map" aria-label="Stylized organ map"><div className="body-head" /><div className="body-torso"><button className={signal.organ === 'THYMUS' ? 'selected' : ''} onClick={() => setSelectedId('thymus-lymphocytes')} style={{ top: '18%', left: '43%' }} title="Thymus"><span /></button><button className={signal.organ === 'LUNG' ? 'selected' : ''} onClick={() => setSelectedId('lung-infiltration')} style={{ top: '28%', left: '28%' }} title="Lung"><span /></button><button className={signal.organ === 'HEART' ? 'selected' : ''} onClick={() => setSelectedId('heart-infiltration')} style={{ top: '34%', left: '55%' }} title="Heart"><span /></button><button className={signal.organ === 'LIVER' ? 'selected' : ''} onClick={() => setSelectedId('liver-inflammatory')} style={{ top: '51%', left: '31%' }} title="Liver"><span /></button><button className={signal.organ === 'KIDNEY' ? 'selected' : ''} onClick={() => setSelectedId('kidney-infiltration')} style={{ top: '58%', left: '59%' }} title="Kidney"><span /></button></div><div className="body-legs" /></div>
                <div className="signal-list">{ranked.map((item) => <button key={item.id} className={item.id === signal.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}><span className="organ-abbr">{item.organ.slice(0, 2)}</span><span className="signal-copy"><b>{item.organ}</b><small>{item.finding}</small></span><span className="signal-count">{item.affectedAnimals}/{item.totalAnimals}</span><PriorityPill value={item.reviewPriority} /></button>)}</div>
              </div>
            </article>

            <article className="panel selected-signal" id="dose">
              <div className="selected-heading"><span className="selected-icon"><Microscope size={21} /></span><div><span className="panel-kicker">Selected evidence thread</span><h2>{signal.organ} · {signal.finding}</h2></div><PriorityPill value={signal.reviewPriority} /></div>
              <div className="chart-grid">
                <div className="chart-card"><div className="chart-title"><div><b>Finding incidence</b><small>affected animals by dose</small></div><span>MI + DM + TX</span></div><DoseResponseChart signal={signal} groups={evidence.doseGroups} /></div>
                <div className="chart-card"><div className="chart-title"><div><b>{lab.label} trajectory</b><small>group mean by study day</small></div><span>LB + DM + TX</span></div><LabTrajectoryChart series={lab} /></div>
              </div>
              <div className="evidence-ribbon">
                <div><span className="domain-tag">MI</span><b>{signal.affectedAnimals} animals</b><small>finding + severity</small></div>
                <i />
                <div><span className="domain-tag">DM</span><b>{evidence.study.animalCount} animals</b><small>identity + group</small></div>
                <i />
                <div><span className="domain-tag">TX</span><b>{evidence.doseGroups.length} groups</b><small>dose + vehicle</small></div>
                <i />
                <div><span className="domain-tag">LB</span><b>{signal.correlatedLab || 'Context'}</b><small>longitudinal labs</small></div>
              </div>
            </article>
          </section>
          <AgentPanel id="agent" study={evidence.study} signal={signal} profileId={semantics.activeProfile.id} enabled={canInvestigate} />
        </div>
        <section className="panel graph-panel graph-wide" id="graph">
          <div className="panel-heading"><div><span className="panel-kicker">Interactive evidence network</span><h2>{signal.organ}: from dose assignment to source artifact</h2><p>Follow the highlighted path, select any node for context, or expand the graph for investigation mode.</p></div><div className="graph-actions"><button className="text-action" onClick={() => openView('semantics')}>See data model <Braces size={13} /></button><button className="secondary-action graph-expand" onClick={() => setGraphOpen(true)}><Expand size={13} /> Expand graph</button></div></div>
          <EvidenceGraph evidence={evidence} signal={signal} />
        </section>
        <footer className="study-footer"><span>{evidence.provenance.method}</span><a href={evidence.study.source} target="_blank" rel="noreferrer">PhUSE SENDConform · {evidence.study.sourceRevision.slice(0, 9)}</a><span>{evidence.provenance.disclaimer}</span></footer>
        {graphOpen && <div className="graph-modal-backdrop" role="presentation" onMouseDown={() => setGraphOpen(false)}><section className="graph-modal" role="dialog" aria-modal="true" aria-label={`Evidence network for ${signal.organ}`} onMouseDown={(event) => event.stopPropagation()}><header><div><span className="panel-kicker">Immersive evidence network</span><h2>{signal.organ} · {signal.finding}</h2></div><button className="icon-button" onClick={() => setGraphOpen(false)} aria-label="Close evidence graph"><X size={18} /></button></header><EvidenceGraph evidence={evidence} signal={signal} immersive /></section></div>}
      </>}
      {roomOpen && <InvestigationRoom evidence={evidence} signal={signal} runtime={semantics} literature={literature.filter((document) => document.matchedSignalIds.includes(signal.id))} onClose={() => setRoomOpen(false)} />}
    </main>
  </div>;
}

function Architecture({ evidence, onBack }: { evidence: StudyEvidence; onBack: () => void }) {
  const layers = [
    { n: '01', title: 'Source evidence', sub: 'SEND XPT + Define-XML', body: 'Original checksummed artifacts remain replayable and attributed.', tone: 'cyan' },
    { n: '02', title: 'Solution import', sub: 'Versioned evidence contract', body: 'Validated CDISC-derived evidence enters through an idempotent deployment boundary.', tone: 'green' },
    { n: '03', title: 'MongoDB Atlas', sub: 'Evidence + vectors + graph', body: 'The solution owns records, semantic chunks, investigations and relationship views.', tone: 'violet' },
    { n: '04', title: 'Bundled Magenta', sub: 'Governed investigation', body: 'The internal agent plans read-only tools, retrieves, reranks and cites evidence.', tone: 'amber' },
    { n: '05', title: 'Solution app', sub: 'Expert review workspace', body: 'Interactive visuals, explanations, feedback and audit trail.', tone: 'rose' },
  ];
  return <section className="architecture-page">
    <button className="back-link" onClick={onBack}>← Back to study workspace</button>
    <div className="architecture-title"><div className="eyebrow">How it was created</div><h1>One governed source. Many intelligent interactions.</h1><p>The business application is intentionally separate from the data factory, canonical model, and agent runtime.</p></div>
    <div className="architecture-flow">{layers.map((layer, index) => <article key={layer.n} className={`architecture-card tone-${layer.tone}`}><span>{layer.n}</span><div className="architecture-icon">{index === 0 ? <FileCheck2 /> : index === 1 ? <Database /> : index === 2 ? <GitBranch /> : index === 3 ? <Bot /> : <Activity />}</div><h2>{layer.title}</h2><b>{layer.sub}</b><p>{layer.body}</p>{index < layers.length - 1 && <i>→</i>}</article>)}</div>
    <div className="boundary-grid">
      <article><span className="ready-dot" /><div><h3>Available now</h3><p>Canonical CDISC records, {evidence.study.recordCount.toLocaleString()}-record example, immutable snapshots, analysis, lineage and hybrid search contract.</p></div></article>
      <article><span className="configure-dot" /><div><h3>Deployment configuration</h3><p>MongoDB Atlas, Search and Vector Search indexes, model provider and application authentication.</p></div></article>
      <article><span className="build-dot" /><div><h3>Solution intelligence</h3><p>Safety-specific projections, second-stage reranking, cross-study graph, agent evaluation and expert feedback loops.</p></div></article>
    </div>
    <div className="contract-table"><div className="contract-head"><span>Owner</span><span>Owns</span><span>Must not own</span></div><div><b>HDL + Kehrnel</b><span>Upstream data creation, CDISC validation, model learning and query prototyping</span><span>Production solution availability</span></div><div><b>Solution MongoDB</b><span>Deployed evidence, search/vector projections, review state and APIs</span><span>Upstream experimentation workspaces</span></div><div><b>Bundled Magenta</b><span>Agent graph, memory, tool policy, traces and human review</span><span>Unscoped database access</span></div><div><b>Solution UI</b><span>Safety workflow, visuals, evidence assembly and reviewer experience</span><span>Standards-authoring logic</span></div></div>
  </section>;
}
