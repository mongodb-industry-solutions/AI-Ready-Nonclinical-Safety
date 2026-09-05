'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BookOpenCheck, Braces, ChevronDown, CircleHelp, Expand, FileCheck2, FlaskConical, GitBranch, Layers3, LayoutDashboard, Microscope, Search, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
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
import CommandPalette from '@/components/CommandPalette';
import MongoLeaf from '@/components/MongoLeaf';
import ThemeToggle from '@/components/ThemeToggle';
import NonclinicalSafetySherpa from '@/components/sherpa/NonclinicalSafetySherpa';

type WorkspaceView = 'journey' | 'workspace' | 'portfolio' | 'semantics' | 'architecture' | 'audit';
type Section = 'investigate' | 'model' | 'evidence';

/**
 * Three top-level sections instead of six peer views. Each section owns the
 * views that answer the same question, so the sidebar states the workflow —
 * investigate a signal, understand the model behind it, prove where it came
 * from — and the sub-tabs handle the detail.
 */
const sections: Array<{ id: Section; label: string; caption: string; views: WorkspaceView[] }> = [
  { id: 'investigate', label: 'Investigate', caption: 'Triage signals and ask the agent', views: ['workspace', 'portfolio'] },
  { id: 'model', label: 'Understand the model', caption: 'Meaning, contracts and architecture', views: ['semantics', 'architecture'] },
  { id: 'evidence', label: 'Prove it', caption: 'Provenance, lineage and review', views: ['audit'] },
];

const viewMeta: Record<Exclude<WorkspaceView, 'journey'>, { label: string; hint: string }> = {
  workspace: { label: 'Signal workspace', hint: 'Dose × organ matrix, charts and evidence graph' },
  portfolio: { label: 'Portfolio similarity', hint: 'Explainable cross-study comparison' },
  semantics: { label: 'Semantic model', hint: 'Business, graph, retrieval and physical lenses' },
  architecture: { label: 'Solution architecture', hint: 'Build-time and runtime boundaries' },
  audit: { label: 'Audit & lineage', hint: 'Checksums, provenance and review actions' },
};

const sectionIcons: Record<Section, typeof LayoutDashboard> = {
  investigate: LayoutDashboard,
  model: Layers3,
  evidence: FileCheck2,
};

function sectionOf(view: WorkspaceView): Section {
  return sections.find((item) => item.views.includes(view))?.id || 'investigate';
}

/**
 * Urgency and the observed dose pattern are separate questions, so they get
 * separate columns. Neither is a toxicologic conclusion: the assessment is the
 * stored descriptive `pattern`, while the review band is the projector's stored
 * `reviewPriority` and is never silently recomputed by the UI.
 */
const assessmentLabel: Record<string, string> = {
  'treated-only': 'Treated-only',
  'control-and-treated': 'Control + treated',
  'control-only': 'Control-only',
  'dose-responsive': 'Dose-responsive',
  'non-monotonic': 'Non-monotonic',
  'local-tolerance': 'Local tolerance',
  'sparse': 'Sparse',
};

const assessmentHint: Record<string, string> = {
  'treated-only': 'Absent in control animals and present in treated groups',
  'control-and-treated': 'Observed in control and treated animals; this pattern alone neither establishes nor excludes a treatment relationship',
  'control-only': 'Observed only in control animals in this study snapshot',
  'dose-responsive': 'Observed incidence increases across the ordered dose groups',
  'non-monotonic': 'Observed across groups without a monotonic dose relationship',
  'local-tolerance': 'Observed at an administration site; systemic relevance still requires expert context',
  'sparse': 'Too few affected animals to establish a pattern',
};

const priorityLabel: Record<SafetySignal['reviewPriority'], string> = { high: 'High', medium: 'Medium', context: 'Context', low: 'Low' };

const priorityHint: Record<SafetySignal['reviewPriority'], string> = {
  high: 'Review first',
  medium: 'Review after the treated-only findings',
  context: 'Interpret with control incidence and other study context',
  low: 'Review last',
};

function PriorityPill({ value }: { value: SafetySignal['reviewPriority'] }) {
  return <span className={`priority-pill priority-${value}`} title={priorityHint[value]}>{priorityLabel[value]}</span>;
}

export default function SafetyIntelligenceApp({ evidence: initialEvidence, portfolioEvidence, initialSemantics, literature }: { evidence: StudyEvidence; portfolioEvidence: StudyEvidence[]; initialSemantics: SemanticRuntimeView; literature: LiteratureDocument[] }) {
  const [view, setView] = useState<WorkspaceView>('workspace');
  const [evidence, setEvidence] = useState(initialEvidence);
  const [selectedId, setSelectedId] = useState(initialEvidence.signals[0].id);
  const [graphOpen, setGraphOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomCanvas, setRoomCanvas] = useState<InvestigationCanvas>('coherence');
  const [recordFocus, setRecordFocus] = useState<EvidenceDomain>();
  const [semanticFocus, setSemanticFocus] = useState<string>();
  const [journeyStep, setJourneyStep] = useState(0);
  const [studyMenuOpen, setStudyMenuOpen] = useState(false);
  const [semantics, setSemantics] = useState(initialSemantics);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const signalListRef = useRef<HTMLDivElement>(null);
  const signal = evidence.signals.find((item) => item.id === selectedId) || evidence.signals[0];
  const lab = signal.correlatedLab ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  const ranked = useMemo(() => evidence.signals.map((item) => ({ ...item, score: reviewScore(item, evidence.doseGroups) })).sort((a, b) => b.score - a.score), [evidence]);
  const canInvestigate = semantics.capabilities.some((item) => item.id === 'assemble-evidence-brief');
  const canCompare = semantics.capabilities.some((item) => item.id === 'retrieve-similar-findings');
  const availableStudies = portfolioEvidence.filter((item) => item.study.evidenceClass !== 'synthetic-benchmark');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const list = signalListRef.current;
    const target = list?.querySelector<HTMLElement>('button.selected');
    if (!list || !target) return;
    // Keep the selection visible inside the list without scrolling the document.
    const offset = target.offsetTop - list.clientHeight / 2 + target.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, [selectedId]);
  const scrollToSection = (target: string) => {
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const openInvestigation = () => {
    if (!canInvestigate) return;
    setRoomCanvas('coherence');
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

  return <div className="app-shell" data-sherpa-state="app-ready">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><MongoLeaf size={26} /></span><div><strong>Safety Intelligence</strong><small>MongoDB Solution Library</small></div></div>
      <nav className="primary-nav">
        {sections.map((section) => {
          const Icon = sectionIcons[section.id];
          const active = view !== 'journey' && sectionOf(view) === section.id && !roomOpen;
          return <button
            key={section.id}
            aria-label={section.label}
            data-sherpa-action={section.id === 'investigate' ? 'open-signal-workspace' : section.id === 'model' ? 'open-semantic-model' : 'open-audit-lineage'}
            data-sherpa-expected-state={section.id === 'investigate' ? 'signal-workspace' : section.id === 'model' ? 'semantic-model' : 'audit-lineage'}
            aria-current={active ? 'page' : undefined}
            className={active ? 'active' : ''}
            onClick={() => openView(section.views[0])}
          ><Icon size={17} /><span>{section.label}</span></button>;
        })}
        <button
          aria-label="Investigation room"
          data-sherpa-action="open-investigation-room"
          data-sherpa-expected-state="investigation-room"
          className={roomOpen ? 'active' : ''}
          disabled={!canInvestigate}
          title={canInvestigate ? undefined : 'The active semantic profile cannot run the AI investigator'}
          onClick={openInvestigation}
        ><Sparkles size={17} /><span>Investigation room</span></button>
      </nav>
      <div className="nav-divider" />
      <nav className="secondary-nav">
        <button aria-label="Guided journey" data-sherpa-action="open-learning-journey" data-sherpa-expected-state="learning-journey" className={view === 'journey' ? 'active' : ''} onClick={() => openView('journey')}>
          <BookOpenCheck size={16} /><span>Guided journey</span><em>{journeyStep + 1}/7</em>
        </button>
      </nav>
      <div className="source-card"><div><span className="status-dot" /> Published evidence</div><strong>{evidence.study.implementationGuide}</strong><small>Immutable · checksum verified</small></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div className="study-control"><button className="study-switcher" aria-label="Choose active SEND study" aria-expanded={studyMenuOpen} onClick={() => setStudyMenuOpen((open) => !open)}><span className="study-icon"><FlaskConical size={16} /></span><span><b>{evidence.study.title}</b><small>{evidence.study.id} · {evidence.study.snapshotId}</small></span><ChevronDown size={14} /></button>{studyMenuOpen && <div className="study-menu" role="menu">{availableStudies.map((item) => <button type="button" role="menuitem" className={item.study.id === evidence.study.id ? 'active' : ''} key={`${item.study.id}:${item.study.snapshotId}`} onClick={() => changeStudy(item.study.id)}><b>{item.study.title}</b><small>{item.study.compoundName || item.study.id} · {item.study.animalCount} animals · {item.signals.length} findings</small></button>)}</div>}</div>
        <button type="button" className="global-search" onClick={() => setPaletteOpen(true)} aria-label="Search findings, studies and the semantic map"><Search size={14} /><span>Search findings, studies, concepts…</span><kbd>⌘ K</kbd></button>
        <span className="published"><ShieldCheck size={14} /> Published</span>
        <label className="profile-switcher"><UserRound size={13} /><select value={semantics.activeProfile.id} onChange={(event) => changeProfile(event.target.value as SemanticProfileId)}>{semantics.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
        <ThemeToggle /><button className="icon-button" aria-label="Open guided journey" title="Learn how to use this solution" onClick={() => openView('journey')}><CircleHelp size={17} /></button>
      </header>

      {view !== 'journey' && (() => {
        const section = sections.find((item) => item.id === sectionOf(view));
        if (!section || section.views.length < 2) return null;
        return <nav className="section-tabs" aria-label={`${section.label} views`}>
          {section.views.map((item) => {
            const meta = viewMeta[item as Exclude<WorkspaceView, 'journey'>];
            const disabled = item === 'portfolio' && !canCompare;
            return <button
              key={item}
              type="button"
              aria-label={meta.label}
              data-sherpa-action={item === 'portfolio' ? 'open-portfolio' : item === 'architecture' ? 'open-architecture' : undefined}
              data-sherpa-expected-state={item === 'portfolio' ? 'portfolio' : item === 'architecture' ? 'architecture' : undefined}
              aria-current={view === item ? 'page' : undefined}
              className={view === item ? 'active' : ''}
              disabled={disabled}
              title={disabled ? 'The active semantic profile cannot compare portfolio findings' : meta.hint}
              onClick={() => openView(item)}
            ><b>{meta.label}</b><small>{meta.hint}</small></button>;
          })}
        </nav>;
      })()}
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

        <section className="panel matrix-panel" id="signals" data-sherpa-state="signal-workspace">
          <div className="panel-heading"><div><span className="panel-kicker">Study-wide visual triage</span><h2>Dose × organ signal matrix</h2><p>Scan every finding at once. Select a row to synchronize the charts, evidence graph, and AI investigator.</p></div><div className="matrix-callout"><Activity size={14} /><span><b>{ranked.filter((item) => item.reviewPriority === 'high').length}</b> priority signal</span></div></div>
          <SignalMatrix groups={evidence.doseGroups} signals={ranked} selectedId={signal.id} onSelect={setSelectedId} />
        </section>

        <div className="content-grid">
          <section className="analysis-column">
            <article className="panel signal-map-panel">
              <div className="panel-heading"><div><span className="panel-kicker">Organ signal map</span><h2>Findings ranked for review</h2></div><div className="legend">Ranked by review score</div></div>
              <div className="signal-landscape">
                <AnatomicalSignalNavigator signals={ranked} selectedId={signal.id} species={evidence.study.species} onSelect={setSelectedId} />
                <div ref={signalListRef} className="signal-list" tabIndex={0} aria-label={`${ranked.length} findings ranked for review`}>{ranked.length > 10 && <div className="list-scroll-status"><span>{ranked.length} ranked findings</span><span>Scroll to explore</span></div>}<div className="signal-list-header" aria-hidden="true"><span>Finding</span><span title="Heuristic review score from treated incidence, severity and a treated-only bonus. This is what the list is ordered by.">Score</span><span title="Descriptive incidence pattern; not a causality conclusion">Observed pattern</span><span title="Projector-assigned review band">Review band</span></div>{ranked.map((item) => <button key={item.id} className={item.id === signal.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}><span className="organ-abbr">{item.organ.slice(0, 2)}</span><span className="signal-copy"><b>{item.organ}</b><small title={item.finding}>{item.finding}</small></span><span className="signal-count" title={`Review score ${item.score} of 100 · ${item.affectedAnimals} of ${item.totalAnimals} animals affected`}>{item.score}</span><span className="signal-assessment" title={assessmentHint[item.pattern] || item.pattern}>{assessmentLabel[item.pattern] || item.pattern.replaceAll('-', ' ')}</span><PriorityPill value={item.reviewPriority} /></button>)}</div>
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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        evidence={evidence}
        studies={availableStudies}
        profileId={semantics.activeProfile.id}
        onSelectSignal={setSelectedId}
        onSelectStudy={changeStudy}
        onOpenView={openView}
        onOpenSemantic={openSemantic}
      />
      {roomOpen && <InvestigationRoom evidence={evidence} signal={signal} runtime={semantics} literature={literature.filter((document) => document.matchedSignalIds.includes(signal.id))} initialCanvas={roomCanvas} recordFocus={recordFocus} onClose={() => setRoomOpen(false)} onOpenSemantic={openSemantic} />}
    </main>
    <NonclinicalSafetySherpa />
  </div>;
}
