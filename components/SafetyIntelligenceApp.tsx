'use client';

import { useMemo, useState } from 'react';
import { Activity, BookOpenCheck, Braces, ChevronDown, CircleHelp, Dna, Expand, FileCheck2, FlaskConical, GitBranch, GitCompareArrows, Layers3, LayoutDashboard, Microscope, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
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
import ArchitectureView from '@/components/ArchitectureView';
import PortfolioIntelligenceView from '@/components/PortfolioIntelligenceView';
import LearningJourney from '@/components/LearningJourney';
import EvidenceAssembly, { type EvidenceDomain } from '@/components/EvidenceAssembly';
import type { InvestigationCanvas } from '@/components/InvestigationRoom';
import AnatomicalSignalNavigator from '@/components/AnatomicalSignalNavigator';

type WorkspaceView = 'journey' | 'workspace' | 'portfolio' | 'semantics' | 'architecture' | 'audit';

function PriorityPill({ value }: { value: SafetySignal['reviewPriority'] }) {
  return <span className={`priority-pill priority-${value}`}>{value === 'high' ? 'review first' : value}</span>;
}

export default function SafetyIntelligenceApp({ evidence: initialEvidence, portfolioEvidence, initialSemantics, literature }: { evidence: StudyEvidence; portfolioEvidence: StudyEvidence[]; initialSemantics: SemanticRuntimeView; literature: LiteratureDocument[] }) {
  const [view, setView] = useState<WorkspaceView>('workspace');
  const [evidence, setEvidence] = useState(initialEvidence);
  const [selectedId, setSelectedId] = useState(initialEvidence.signals[0].id);
  const [graphOpen, setGraphOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomCanvas, setRoomCanvas] = useState<InvestigationCanvas>('evidence');
  const [recordFocus, setRecordFocus] = useState<EvidenceDomain>();
  const [semanticFocus, setSemanticFocus] = useState<string>();
  const [journeyStep, setJourneyStep] = useState(0);
  const [studyMenuOpen, setStudyMenuOpen] = useState(false);
  const [semantics, setSemantics] = useState(initialSemantics);
  const signal = evidence.signals.find((item) => item.id === selectedId) || evidence.signals[0];
  const lab = signal.correlatedLab ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  const ranked = useMemo(() => evidence.signals.map((item) => ({ ...item, score: reviewScore(item, evidence.doseGroups) })).sort((a, b) => b.score - a.score), [evidence]);
  const canInvestigate = semantics.capabilities.some((item) => item.id === 'assemble-evidence-brief');
  const canCompare = semantics.capabilities.some((item) => item.id === 'retrieve-similar-findings');
  const availableStudies = portfolioEvidence.filter((item) => item.study.evidenceClass !== 'synthetic-benchmark');
  const scrollToSection = (target: string) => {
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const openInvestigation = () => {
    if (!canInvestigate) return;
    setRoomCanvas('evidence');
    setRecordFocus(undefined);
    setView('workspace');
    setRoomOpen(true);
  };
  const inspectEvidenceDomain = (domain: EvidenceDomain) => {
    setRoomCanvas('records');
    setRecordFocus(domain);
    setView('workspace');
    setRoomOpen(true);
  };
  const openView = (target: WorkspaceView) => {
    setRoomOpen(false);
    if (target !== 'semantics') setSemanticFocus(undefined);
    setView(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openSemantic = (focusId?: string) => {
    setRoomOpen(false);
    setSemanticFocus(focusId);
    setView('semantics');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const changeStudy = (studyId: string) => {
    const next = availableStudies.find((item) => item.study.id === studyId);
    if (!next) return;
    setEvidence(next);
    setSelectedId(next.signals[0].id);
    setStudyMenuOpen(false);
    setRoomOpen(false);
  };
  async function changeProfile(profile: SemanticProfileId) {
    const response = await fetch(`/api/semantics?profile=${profile}`, { cache: 'no-store' });
    setSemantics(await response.json());
  }
  function openFromJourney(destination: 'workspace' | 'investigation' | 'semantics' | 'portfolio' | 'architecture' | 'audit') {
    if (destination === 'investigation') {
      if (!canInvestigate) return;
      setView('journey');
      setRoomOpen(true);
      return;
    }
    if (destination === 'semantics') {
      openSemantic('Finding');
      return;
    }
    openView(destination);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Dna size={20} /></span><div><strong>Safety Intelligence</strong><small>MongoDB Solution Library</small></div></div>
      <div className="nav-label">Start here</div>
      <nav><button aria-label="Guided journey" className={view === 'journey' ? 'active' : ''} onClick={() => openView('journey')}><BookOpenCheck size={16} /><span>Guided journey</span><em>{journeyStep + 1}/7</em></button></nav>
      <div className="nav-label">Investigation</div>
      <nav>
        <button aria-label="Study workspace" className={view === 'workspace' && !roomOpen ? 'active' : ''} onClick={() => openView('workspace')}><LayoutDashboard size={16} /><span>Study workspace</span></button>
        <button aria-label="Investigation room" className={roomOpen ? 'active' : ''} disabled={!canInvestigate} title={canInvestigate ? undefined : 'The active semantic profile cannot run the AI investigator'} onClick={openInvestigation}><Sparkles size={16} /><span>Investigation room</span></button>
        <button aria-label="Portfolio similarity" className={view === 'portfolio' ? 'active' : ''} disabled={!canCompare} title={canCompare ? undefined : 'The active semantic profile cannot compare portfolio findings'} onClick={() => openView('portfolio')}><GitCompareArrows size={16} /><span>Portfolio similarity</span><em>new</em></button>
      </nav>
      <div className="nav-label">Platform</div>
      <nav><button aria-label="Semantic model" onClick={() => openSemantic()} className={view === 'semantics' ? 'active' : ''}><Braces size={16} /><span>Semantic model</span></button><button aria-label="Solution architecture" onClick={() => openView('architecture')} className={view === 'architecture' ? 'active' : ''}><Layers3 size={16} /><span>Solution architecture</span></button><button aria-label="Audit and lineage" onClick={() => openView('audit')} className={view === 'audit' ? 'active' : ''}><FileCheck2 size={16} /><span>Audit & lineage</span></button></nav>
      <div className="source-card"><div><span className="status-dot" /> Published evidence</div><strong>{evidence.study.implementationGuide}</strong><small>Immutable · checksum verified</small></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div className="study-control"><button className="study-switcher" aria-label="Choose active SEND study" aria-expanded={studyMenuOpen} onClick={() => setStudyMenuOpen((open) => !open)}><span className="study-icon"><FlaskConical size={16} /></span><span><b>{evidence.study.title}</b><small>{evidence.study.id} · {evidence.study.snapshotId}</small></span><ChevronDown size={14} /></button>{studyMenuOpen && <div className="study-menu" role="menu">{availableStudies.map((item) => <button type="button" role="menuitem" className={item.study.id === evidence.study.id ? 'active' : ''} key={`${item.study.id}:${item.study.snapshotId}`} onClick={() => changeStudy(item.study.id)}><b>{item.study.title}</b><small>{item.study.compoundName || item.study.id} · {item.study.animalCount} animals · {item.signals.length} findings</small></button>)}</div>}</div>
        <div className="global-search"><Search size={14} /><span>Search findings, animals, tests…</span><kbd>⌘ K</kbd></div>
        <span className="published"><ShieldCheck size={14} /> Published</span>
        <label className="profile-switcher"><UserRound size={13} /><select value={semantics.activeProfile.id} onChange={(event) => changeProfile(event.target.value as SemanticProfileId)}>{semantics.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
        <button className="icon-button" aria-label="Open guided journey" title="Learn how to use this solution" onClick={() => openView('journey')}><CircleHelp size={17} /></button>
      </header>

      {view === 'journey' ? <LearningJourney evidence={evidence} runtime={semantics} activeStep={journeyStep} onStepChange={setJourneyStep} onChangeProfile={changeProfile} onOpen={openFromJourney} /> : view === 'architecture' ? <ArchitectureView evidence={evidence} runtime={semantics} onBack={() => openView('workspace')} /> : view === 'semantics' ? <SemanticModelExplorer runtime={semantics} focusId={semanticFocus} onRuntimeChange={setSemantics} /> : view === 'audit' ? <AuditLineageView evidence={evidence} runtime={semantics} canInvestigate={canInvestigate} onOpenInvestigation={openInvestigation} /> : view === 'portfolio' ? <PortfolioIntelligenceView evidence={evidence} evidenceSet={portfolioEvidence} profileId={semantics.activeProfile.id} semanticReleaseId={semantics.release.releaseId} /> : <>
        <section className="hero-row" id="overview">
          <div><div className="eyebrow">Nonclinical safety review · public demonstration study</div><h1>Signal landscape</h1><p>Move from study-wide patterns to animal-level evidence, then ask an AI investigator to explain exactly what it checked.</p></div>
          <div className="hero-actions"><button className="secondary-action" onClick={() => openView('journey')}><BookOpenCheck size={14} /> Learn the workflow</button><button className="secondary-action" onClick={() => scrollToSection('graph')}><GitBranch size={14} /> Evidence graph</button><button className="primary-action" disabled={!canInvestigate} title={canInvestigate ? undefined : 'The active semantic profile cannot run the AI investigator'} onClick={openInvestigation}><Sparkles size={14} /> Start investigation</button></div>
        </section>

        <section className="metric-row">
          <article><span>Canonical records</span><strong>{evidence.study.recordCount.toLocaleString()}</strong><small>across {evidence.study.domains.length} SEND domains</small></article>
          <article><span>Study animals</span><strong>{evidence.study.animalCount}</strong><small>{evidence.doseGroups.length} treatment groups</small></article>
          <article><span>Microscopy records</span><strong>{evidence.study.domainCounts.MI}</strong><small>source observations</small></article>
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
                <AnatomicalSignalNavigator signals={ranked} selectedId={signal.id} species={evidence.study.species} onSelect={setSelectedId} />
                <div className="signal-list">{ranked.map((item) => <button key={item.id} className={item.id === signal.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}><span className="organ-abbr">{item.organ.slice(0, 2)}</span><span className="signal-copy"><b>{item.organ}</b><small>{item.finding}</small></span><span className="signal-count">{item.affectedAnimals}/{item.totalAnimals}</span><PriorityPill value={item.reviewPriority} /></button>)}</div>
              </div>
            </article>

            <article className="panel selected-signal" id="dose">
              <div className="selected-heading"><span className="selected-icon"><Microscope size={21} /></span><div><span className="panel-kicker">Selected evidence thread</span><h2>{signal.organ} · {signal.finding}</h2></div><PriorityPill value={signal.reviewPriority} /></div>
              <div className="chart-grid">
                <div className="chart-card"><div className="chart-title"><div><b>Finding incidence</b><small>affected animals by dose</small></div><span>MI + DM + TX</span></div><DoseResponseChart signal={signal} groups={evidence.doseGroups} /></div>
                {lab ? <div className="chart-card"><div className="chart-title"><div><b>{lab.label} trajectory</b><small>group mean by study day</small></div><span>LB + DM + TX</span></div><LabTrajectoryChart series={lab} /></div> : <div className="chart-card no-lab-context"><Activity size={23} /><div><b>No asserted laboratory correlate</b><p>The pathology signal remains linked to subjects, treatment groups and source records without inventing a laboratory relationship.</p></div></div>}
              </div>
              <EvidenceAssembly evidence={evidence} signal={signal} onInspect={inspectEvidenceDomain} />
            </article>
          </section>
          <AgentPanel id="agent" study={evidence.study} signal={signal} profileId={semantics.activeProfile.id} enabled={canInvestigate} runtime={semantics} onOpenSemantic={openSemantic} />
        </div>
        <section className="panel graph-panel graph-wide" id="graph">
              <div className="panel-heading"><div><span className="panel-kicker">Interactive evidence network</span><h2>{signal.organ}: from dose assignment to source artifact</h2><p>Follow the highlighted path, select any node for context, or expand the graph for investigation mode.</p></div><div className="graph-actions"><button className="text-action" onClick={() => openSemantic('Finding')}>See data model <Braces size={13} /></button><button className="secondary-action graph-expand" onClick={() => setGraphOpen(true)}><Expand size={13} /> Expand graph</button></div></div>
          <EvidenceGraph evidence={evidence} signal={signal} />
        </section>
        <footer className="study-footer"><span>{evidence.provenance.method}</span><a href={evidence.study.source} target="_blank" rel="noreferrer">PhUSE SENDConform · {evidence.study.sourceRevision.slice(0, 9)}</a><span>{evidence.provenance.disclaimer}</span></footer>
        {graphOpen && <div className="graph-modal-backdrop" role="presentation" onMouseDown={() => setGraphOpen(false)}><section className="graph-modal" role="dialog" aria-modal="true" aria-label={`Evidence network for ${signal.organ}`} onMouseDown={(event) => event.stopPropagation()}><header><div><span className="panel-kicker">Immersive evidence network</span><h2>{signal.organ} · {signal.finding}</h2></div><button className="icon-button" onClick={() => setGraphOpen(false)} aria-label="Close evidence graph"><X size={18} /></button></header><EvidenceGraph evidence={evidence} signal={signal} immersive /></section></div>}
      </>}
      {roomOpen && <InvestigationRoom evidence={evidence} signal={signal} runtime={semantics} literature={literature.filter((document) => document.matchedSignalIds.includes(signal.id))} initialCanvas={roomCanvas} recordFocus={recordFocus} onClose={() => setRoomOpen(false)} onOpenSemantic={openSemantic} />}
    </main>
  </div>;
}
