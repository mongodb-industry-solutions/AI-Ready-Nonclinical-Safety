'use client';

import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowLeft, ArrowRight, BookOpenCheck, Bot, Braces, CheckCircle2, Database, FileCheck2, FlaskConical, GitCompareArrows, Microscope, Network, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import type { SemanticProfileId, SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';
import DoseResponseChart from '@/components/DoseResponseChart';

type JourneyAction = 'workspace' | 'investigation' | 'semantics' | 'portfolio' | 'architecture' | 'audit';

type JourneyChapter = {
  eyebrow: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  action?: JourneyAction;
  actionLabel?: string;
  notice: string;
};

const chapters: JourneyChapter[] = [
  { eyebrow: 'Orientation', title: 'Why nonclinical safety exists', summary: 'Begin with the scientific decision—not the software. Learn what a study can establish before a medicine reaches people.', icon: BookOpenCheck, notice: 'A signal is a reason to investigate. It is not automatically an adverse effect or a regulatory conclusion.' },
  { eyebrow: 'People', title: 'Meet the investigation team', summary: 'See how toxicologists, study directors, data stewards, portfolio leads, and external reviewers approach the same evidence differently.', icon: UsersRound, notice: 'The active profile changes visible meaning, tools, fields, and permitted actions—not just the screen layout.' },
  { eyebrow: 'Evidence', title: 'Read a SEND study', summary: 'Understand dose groups, animals, microscopic findings, laboratory measurements, and the source records that connect them.', icon: FlaskConical, action: 'workspace', actionLabel: 'Open the study workspace', notice: 'CDISC SEND supplies the standardized evidence. The application adds a governed, rebuildable investigation projection.' },
  { eyebrow: 'Triage', title: 'Recognize a safety signal', summary: 'Use incidence, dose response, severity, biological coherence, and controls to decide what deserves expert attention.', icon: Activity, action: 'workspace', actionLabel: 'Explore the signal matrix', notice: 'The priority score orders review work. It must never be interpreted as an automated causality decision.' },
  { eyebrow: 'Investigation', title: 'Test a hypothesis', summary: 'Let the investigator assemble exact records, semantic evidence, graph context, literature, and an inspectable execution trace.', icon: Bot, action: 'investigation', actionLabel: 'Enter the Investigation Room', notice: 'The AI coordinates evidence. The expert accepts, revises, or rejects the hypothesis and remains accountable.' },
  { eyebrow: 'Meaning', title: 'Resolve ambiguity with the map', summary: 'Inspect concepts, terminology, value sets, archetypes, physical placements, and the resolver that binds meaning to operations.', icon: Braces, action: 'semantics', actionLabel: 'Converse with the semantic map', notice: 'Meaning is versioned independently from storage. A resolver compiles governed intent into a concrete solution query.' },
  { eyebrow: 'Trust', title: 'Explain and defend the result', summary: 'Trace every answer to canonical evidence, see which operations really ran, and understand the complete deployment boundary.', icon: ShieldCheck, action: 'audit', actionLabel: 'Inspect audit and lineage', notice: 'A credible blueprint shows provenance, authorization, fallbacks, and uncertainty—not only a polished answer.' },
];

const roleIntent: Record<SemanticProfileId, { question: string; responsibility: string }> = {
  toxicologist: { question: 'Is the pattern treatment-related and biologically meaningful?', responsibility: 'Interprets findings across dose, severity, time, organ, laboratory context, and prior knowledge.' },
  'study-director': { question: 'Is the study evidence complete, coherent, and ready to report?', responsibility: 'Owns study conduct, integration, review status, and the final study-level narrative.' },
  'data-steward': { question: 'Are identity, terminology, validation, and lineage trustworthy?', responsibility: 'Governs quality, controlled terminology, mappings, discrepancies, and reproducibility.' },
  'portfolio-lead': { question: 'Does this pattern recur across compounds or studies?', responsibility: 'Compares evidence at portfolio level while preserving observed-versus-synthetic boundaries.' },
  'external-reviewer': { question: 'Can I independently inspect the evidence behind this assertion?', responsibility: 'Receives a constrained, read-only view with citations and protected fields removed.' },
};

const glossary = [
  ['Finding', 'An observation made during examination; here, usually a microscopic tissue observation.'],
  ['Incidence', 'The number or proportion of animals in a group with the finding.'],
  ['Severity', 'The graded extent of an observed finding—not the certainty that treatment caused it.'],
  ['Control', 'A comparison group that does not receive the active test article.'],
  ['SEND', 'CDISC Standard for Exchange of Nonclinical Data.'],
  ['Resolver', 'A governed contract that binds intent and meaning to an executable retrieval plan.'],
];

export default function LearningJourney({
  evidence,
  runtime,
  activeStep,
  onStepChange,
  onChangeProfile,
  onOpen,
}: {
  evidence: StudyEvidence;
  runtime: SemanticRuntimeView;
  activeStep: number;
  onStepChange: (step: number) => void;
  onChangeProfile: (profile: SemanticProfileId) => void;
  onOpen: (destination: JourneyAction) => void;
}) {
  const chapter = chapters[activeStep] || chapters[0];
  const ChapterIcon = chapter.icon;
  const signal = evidence.signals[0];

  return <section className="learning-journey">
    <header className="journey-hero">
      <div><span className="eyebrow">Guided product journey · no domain expertise required</span><h1>From study data to a defensible safety hypothesis</h1><p>Follow one real investigation from the scientist&apos;s question down to SEND records, semantics, MongoDB queries, AI orchestration, and audit evidence.</p></div>
      <div className="journey-progress"><strong>{activeStep + 1}</strong><span>of {chapters.length}</span><div><i style={{ width: `${((activeStep + 1) / chapters.length) * 100}%` }} /></div></div>
    </header>

    <div className="journey-layout">
      <nav className="journey-chapters" aria-label="Learning journey chapters">
        {chapters.map((item, index) => { const Icon = item.icon; return <button key={item.title} className={index === activeStep ? 'active' : index < activeStep ? 'complete' : ''} onClick={() => onStepChange(index)}><i>{index < activeStep ? <CheckCircle2 size={13} /> : <Icon size={13} />}</i><span><small>{String(index + 1).padStart(2, '0')} · {item.eyebrow}</small><b>{item.title}</b></span></button>; })}
      </nav>

      <main className="journey-content">
        <div className="journey-chapter-title"><span><ChapterIcon size={19} /></span><div><small>{chapter.eyebrow}</small><h2>{chapter.title}</h2><p>{chapter.summary}</p></div></div>

        {activeStep === 0 && <div className="journey-story">
          <section className="lesson-callout"><Microscope size={20} /><div><b>The business question</b><p>Before first-in-human studies, experts must understand whether findings in animals are related to treatment, whether they increase with dose, whether other measurements support them, and how relevant they may be to people.</p></div></section>
          <div className="journey-flow">{[['1', 'Observe', 'A pathologist records a finding'], ['2', 'Compare', 'Controls versus dose groups'], ['3', 'Connect', 'Labs, subjects, prior evidence'], ['4', 'Interpret', 'Expert weighs biological relevance'], ['5', 'Defend', 'Every statement retains provenance']].map(([number, label, detail], index) => <article key={label}><i>{number}</i><b>{label}</b><small>{detail}</small>{index < 4 && <ArrowRight size={14} />}</article>)}</div>
          <section className="lesson-definition"><strong>What this application is</strong><p>A nonclinical safety investigation cockpit. It helps an expert find, connect, explain, and review evidence; it does not replace the expert or produce an autonomous regulatory conclusion.</p></section>
        </div>}

        {activeStep === 1 && <div className="role-learning-grid">{runtime.profiles.map((profile) => { const role = roleIntent[profile.id]; const active = runtime.activeProfile.id === profile.id; return <button className={active ? 'active' : ''} key={profile.id} onClick={() => onChangeProfile(profile.id)}><span><UsersRound size={15} /><em>{active ? 'Active lens' : 'Try this lens'}</em></span><h3>{profile.label}</h3><blockquote>{role.question}</blockquote><p>{role.responsibility}</p><small>{profile.grants.length} grants · {profile.maskedFields.length ? `${profile.maskedFields.length} masked field rules` : 'no field masks'}</small></button>; })}</div>}

        {activeStep === 2 && <div className="study-lesson">
          <section className="study-facts"><span><small>STUDY</small><b>{evidence.study.id}</b></span><span><small>ANIMALS</small><b>{evidence.study.animalCount}</b></span><span><small>DOSE GROUPS</small><b>{evidence.doseGroups.length}</b></span><span><small>CANONICAL ROWS</small><b>{evidence.study.recordCount.toLocaleString()}</b></span></section>
          <div className="domain-learning-map">{[{ code: 'DM', title: 'Demographics', copy: 'Who is the animal and to which group does it belong?' }, { code: 'TX', title: 'Trial sets', copy: 'What treatment and dose define each group?' }, { code: 'MI', title: 'Microscopic findings', copy: 'What was observed, in which tissue, and at what severity?' }, { code: 'LB', title: 'Laboratory tests', copy: 'How did measurements change over study time?' }].map((domain) => <article key={domain.code}><i>{domain.code}</i><div><b>{domain.title}</b><p>{domain.copy}</p><small>{evidence.study.domainCounts[domain.code] || 0} records in this snapshot</small></div></article>)}</div>
          <section className="lesson-callout"><Database size={20} /><div><b>Why the document model matters</b><p>Canonical SEND rows remain directly interoperable. Rebuildable study, graph, search, and semantic projections make the investigator fast without changing the underlying evidence.</p></div></section>
        </div>}

        {activeStep === 3 && <div className="triage-lesson">
          <section className="journey-chart"><header><div><small>FOLLOW THIS EXAMPLE</small><h3>{signal.organ} · {signal.finding}</h3></div><em>{signal.pattern}</em></header><DoseResponseChart signal={signal} groups={evidence.doseGroups} /></section>
          <div className="reasoning-cards">{[['Control comparison', `${signal.incidence[0] || 0}/${evidence.doseGroups[0]?.animalCount || 0} control animals`], ['Dose pattern', signal.pattern], ['Severity context', Object.entries(signal.severity).map(([key, value]) => `${key} ${value}`).join(' · ')], ['Corroboration', signal.correlatedLab ? `${signal.correlatedLab} laboratory trajectory available` : 'No laboratory correlate asserted']].map(([label, value]) => <article key={label}><small>{label}</small><b>{value}</b></article>)}</div>
          <p className="journey-question"><Sparkles size={14} /> What would make this pattern more—or less—plausibly treatment-related?</p>
        </div>}

        {activeStep === 4 && <div className="investigation-lesson">
          <div className="investigation-method">{[['01', 'Bind', 'Lock study, snapshot, signal, and role.'], ['02', 'Retrieve', 'Read exact SEND rows and relevant semantic or literature context.'], ['03', 'Connect', 'Traverse dose, subject, finding, lab, and source evidence.'], ['04', 'Evaluate', 'Compare incidence, severity, coherence, and alternatives.'], ['05', 'Explain', 'Compose a cited hypothesis and disclose every executed step.']].map(([number, title, copy]) => <article key={number}><i>{number}</i><div><b>{title}</b><p>{copy}</p></div></article>)}</div>
          <section className="agent-preview"><Bot size={24} /><div><small>EXAMPLE QUESTION</small><h3>Is this thymus finding plausibly treatment-related?</h3><p>The full-screen investigator answers with charts and graphs, not text alone, and separates the declared resolver from measured execution.</p></div></section>
        </div>}

        {activeStep === 5 && <div className="semantics-lesson">
          <div className="semantic-layer-stack">{[['01', 'Concepts & terminology', 'What does “finding”, “severity”, or “thymus” mean?'], ['02', 'Value sets', 'Which governed values may bind to a field?'], ['03', 'Archetypes', 'Which semantic blocks may contain one another?'], ['04', 'Placements', 'Where can the same meaning be found physically?'], ['05', 'Capabilities & resolvers', 'What may this profile ask, and how is it compiled into operations?']].map(([number, label, copy]) => <article key={number}><span>{number}</span><div><b>{label}</b><p>{copy}</p></div></article>)}</div>
          <section className="meaning-dialogue"><Network size={20} /><div><b>When confidence is insufficient, ask the map</b><p>“Do you mean microscopic lymphocyte depletion from the SEND finding-morphology value set, or a laboratory lymphocyte measurement?” The user chooses; the resolver rebinds the question; the answer keeps that interpretation visible.</p><small>{runtime.release.releaseId} · {runtime.objects.length} visible objects · {runtime.resolvers.length} resolvers</small></div></section>
        </div>}

        {activeStep === 6 && <div className="trust-lesson">
          <div className="trust-chain">{[{ icon: Database, title: 'Canonical evidence', text: 'Original values, identities, source artifacts, and hashes.' }, { icon: Braces, title: 'Semantic release', text: 'Versioned meaning, profiles, value sets, archetypes, and resolvers.' }, { icon: Network, title: 'Actual execution', text: 'Operations, predicates, counts, timings, and fallback state.' }, { icon: FileCheck2, title: 'Expert decision', text: 'Append-only review action with human accountability.' }].map(({ icon: Icon, title, text }, index) => <article key={title}><Icon size={18} /><div><b>{title}</b><p>{text}</p></div>{index < 3 && <ArrowRight size={15} />}</article>)}</div>
          <section className="journey-finish"><CheckCircle2 size={23} /><div><h3>You now know how to read the demo</h3><p>Start with the study pattern, inspect the evidence thread, ask the investigator, challenge ambiguous meaning in the semantic map, and finish with lineage—not with the generated prose.</p><div><button onClick={() => onOpen('investigation')}><Sparkles size={13} /> Run the full investigation</button><button onClick={() => onOpen('architecture')}><Database size={13} /> See the complete architecture</button></div></div></section>
        </div>}

        <footer className="journey-controls"><button disabled={activeStep === 0} onClick={() => onStepChange(activeStep - 1)}><ArrowLeft size={13} /> Previous</button><span><b>What to remember</b>{chapter.notice}</span>{activeStep < chapters.length - 1 ? <button className="next" onClick={() => onStepChange(activeStep + 1)}>Next chapter <ArrowRight size={13} /></button> : <button className="next" onClick={() => onOpen('workspace')}>Explore freely <ArrowRight size={13} /></button>}</footer>
      </main>

      <aside className="journey-companion">
        <span className="panel-kicker">Learning companion</span><h3>Terms you will encounter</h3>
        <dl>{glossary.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl>
        {chapter.action && <button className="journey-open-action" onClick={() => onOpen(chapter.action!)}><ChapterIcon size={14} /><span><small>TRY IT IN THE PRODUCT</small><b>{chapter.actionLabel}</b></span><ArrowRight size={13} /></button>}
        {activeStep === 6 && <button className="journey-secondary-action" onClick={() => onOpen('portfolio')}><GitCompareArrows size={13} /> Compare across studies</button>}
      </aside>
    </div>
  </section>;
}
