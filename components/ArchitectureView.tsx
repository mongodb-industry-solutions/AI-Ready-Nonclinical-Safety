'use client';

import { useState } from 'react';
import { ArrowRight, BookOpen, Bot, Braces, CheckCircle2, Code2, Database, FileCheck2, FileText, GitBranch, Layers3, Network, PackageCheck, Search, ShieldCheck, Sparkles, Waypoints, Workflow, Zap } from 'lucide-react';
import type { SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';

type ArchitectureLens = 'blueprint' | 'model' | 'interfaces' | 'value';

interface ArchitectureViewProps {
  evidence: StudyEvidence;
  runtime: SemanticRuntimeView;
  onBack: () => void;
}

const lenses: Array<{ id: ArchitectureLens; label: string; description: string; icon: typeof Layers3 }> = [
  { id: 'blueprint', label: 'Full blueprint', description: 'Build-time and runtime boundaries', icon: Layers3 },
  { id: 'model', label: 'CDISC → documents', description: 'Standard mappings and enrichment', icon: Braces },
  { id: 'interfaces', label: 'APIs & retrieval', description: 'Operational contracts and query flow', icon: Code2 },
  { id: 'value', label: 'Why this architecture', description: 'Capabilities and business value', icon: Sparkles },
];

const apiContracts = [
  { method: 'GET', path: '/api/studies/{studyId}/signals', title: 'Study evidence', input: 'studyId', output: 'Immutable StudyEvidence snapshot', policy: 'Snapshot-bound canonical facts' },
  { method: 'GET', path: '/api/studies/{studyId}/signals/{signalId}/records', title: 'Record evidence', input: 'studyId, signalId', output: 'MI → subject → DM / LB / TX → source artifact', policy: 'Published package; record hashes preserved' },
  { method: 'POST', path: '/api/investigations', title: 'AI investigation', input: 'studyId, signalId, profileId, question', output: 'Cited EvidenceBrief + investigationId', policy: 'Profile-gated; read-only evidence' },
  { method: 'GET', path: '/api/literature', title: 'Hybrid literature retrieval', input: 'signalId, profile, q, limit', output: 'Ranked evidence + execution telemetry', policy: 'Licensed corpus; context, not causality' },
  { method: 'GET · POST', path: '/api/reviews', title: 'Expert review actions', input: 'studyId, snapshotId, signalId, decision', output: 'Append-only review record', policy: 'Action authorization; evidence unchanged' },
  { method: 'GET', path: '/api/semantics', title: 'Profile semantic projection', input: 'profile', output: 'Filtered runtime bundle', policy: 'Object, field, capability and action masks' },
  { method: 'GET · SSE', path: '/api/semantics/stream', title: 'Live semantics', input: 'profile, Last-Event-ID', output: 'Resume-safe semantic events', policy: 'Snapshot first; Change Stream updates' },
  { method: 'POST', path: '/api/semantics/value-sets/observe', title: 'Terminology observation', input: 'valueSetId, value, source, profile', output: 'Candidate release + profile projection', policy: 'Validate, compile, activate; no evidence mutation' },
  { method: 'GET', path: '/api/health', title: 'Runtime health', input: 'none', output: 'Data, agent and review-store modes', policy: 'Configuration status only' },
];

const domainMappings = [
  { domain: 'TS', source: 'Trial summary', object: 'Study + Compound', path: 'cdisc_records (TS) → study / compound', purpose: 'Protocol identity and study context' },
  { domain: 'TX', source: 'Trial sets', object: 'TreatmentGroup', path: 'cdisc_records (TX) → doseGroups[]', purpose: 'Dose, vehicle and group assignment' },
  { domain: 'DM', source: 'Demographics', object: 'Subject', path: 'cdisc_records (DM) → subjects', purpose: 'Animal identity, sex and group' },
  { domain: 'MI', source: 'Microscopic findings', object: 'Finding', path: 'cdisc_records (MI) → signals[]', purpose: 'Organ, morphology, severity and incidence' },
  { domain: 'LB', source: 'Laboratory tests', object: 'LabMeasurement', path: 'cdisc_records (LB) → labSeries', purpose: 'Longitudinal measurements and units' },
  { domain: 'XPT + Define-XML', source: 'Submission artifacts', object: 'SourceArtifact', path: 'source_artifacts → artifact ledger', purpose: 'Variable definitions, checksum and lineage' },
];

export default function ArchitectureView({ evidence, runtime, onBack }: ArchitectureViewProps) {
  const [lens, setLens] = useState<ArchitectureLens>('blueprint');
  const [selectedApi, setSelectedApi] = useState(1);

  return <section className="architecture-page architecture-v2">
    <button className="back-link" onClick={onBack}>← Back to study workspace</button>
    <div className="architecture-title-row">
      <div className="architecture-title"><div className="eyebrow">Reference solution architecture</div><h1>CDISC meaning, operationalized for AI.</h1><p>CDISC SEND remains the governed evidence and traceability anchor. MongoDB turns that standard into a connected document, search, vector, graph, and agent-ready operating model without changing what the source evidence means.</p></div>
      <div className="architecture-release"><CheckCircle2 size={17} /><span><b>{runtime.release.sourceStandard}</b><small>{runtime.release.title} · {runtime.release.version}</small></span></div>
    </div>

    <nav className="architecture-lenses" aria-label="Architecture views">{lenses.map(({ id, label, description, icon: Icon }) => <button key={id} className={lens === id ? 'active' : ''} onClick={() => setLens(id)}><Icon size={16} /><span><b>{label}</b><small>{description}</small></span></button>)}</nav>

    {lens === 'blueprint' && <Blueprint evidence={evidence} runtime={runtime} />}
    {lens === 'model' && <DataModel evidence={evidence} runtime={runtime} />}
    {lens === 'interfaces' && <Interfaces selectedApi={selectedApi} onSelectApi={setSelectedApi} />}
    {lens === 'value' && <ArchitectureValue />}
  </section>;
}

function Blueprint({ evidence, runtime }: { evidence: StudyEvidence; runtime: SemanticRuntimeView }) {
  return <div className="blueprint-view">
    <div className="architecture-principle"><ShieldCheck size={17} /><div><b>CDISC is the source contract—not the application ceiling.</b><p>SEND XPT and Define-XML are validated upstream and retained with checksums. A solution-owned, versioned projector derives the interactive model from canonical rows and records a reconciliation receipt; no parallel hand-authored dataset is required.</p></div></div>

    <section className="architecture-plane enablement-plane">
      <header><span>01</span><div><b>Build-time enablement</b><small>Used to create, validate and compile deployable inputs; absent from the production request path.</small></div><em>not a runtime dependency</em></header>
      <div className="plane-flow">
        <ArchitectureNode icon={FileCheck2} tone="cyan" eyebrow="CDISC source" title="SEND XPT + Define-XML" detail="Sponsor or public study packages" tags={['TS', 'TX', 'DM', 'MI', 'LB']} />
        <FlowArrow label="ingest + validate" />
        <ArchitectureNode icon={PackageCheck} tone="green" eyebrow="HDL + Kehrnel" title="Data factory & model lab" detail="Examples, synthetic scenarios, conformance and query learning" tags={['versioned', 'deterministic']} />
        <FlowArrow label="compile + export" />
        <ArchitectureNode icon={Braces} tone="violet" eyebrow="Context Studio" title="Semantic compiler" detail={`${runtime.objects.length} objects · ${runtime.archetypes.length} archetypes · ${runtime.resolvers.length} resolvers`} tags={['portable bundle', 'digest']} />
      </div>
    </section>

    <section className="architecture-plane runtime-plane">
      <header><span>02</span><div><b>Self-contained solution runtime</b><small>The application owns its database, APIs, agent service, policy enforcement and expert experience.</small></div><em>deployed together</em></header>
      <div className="runtime-map">
        <div className="runtime-sources"><span className="map-column-label">Source adapters</span><ArchitectureNode icon={Database} tone="cyan" eyebrow="Versioned import" title="CDISC study evidence" detail={`${evidence.study.recordCount.toLocaleString()} records · ${evidence.study.snapshotId}`} tags={['immutable']} compact /><ArchitectureNode icon={BookOpen} tone="amber" eyebrow="External context" title="PubMed · PMC · S3" detail="Metadata, permitted passages and source files" tags={['rights-aware']} compact /></div>
        <div className="runtime-connector"><ArrowRight /><span>adapters</span></div>
        <div className="atlas-core">
          <div className="atlas-title"><Database size={18} /><div><b>MongoDB Atlas evidence fabric</b><small>One operational platform; explicitly separated authorities</small></div></div>
          <div className="atlas-planes"><div><span>Immutable evidence</span><code>study_snapshots</code><code>dataset_definitions</code><code>cdisc_records</code><code>subjects · source_artifacts</code></div><div><span>Reconciled projections</span><code>study_evidence · projector v1</code><code>evidence_chunks</code><code>literature_chunks</code><code>semantic_evidence_edges</code></div><div><span>Semantic control</span><code>semantic_releases</code><code>semantic_objects</code><code>semantic_value_sets</code></div><div><span>Solution state</span><code>investigations</code><code>review_actions</code><code>semantic_change_events</code></div></div>
          <div className="atlas-engines"><span><Search size={12} /> Aggregation + Search</span><span><Sparkles size={12} /> Vector Search</span><span><GitBranch size={12} /> Graph lookup</span><span><Zap size={12} /> Change Streams</span></div>
        </div>
        <div className="runtime-connector"><ArrowRight /><span>governed tools</span></div>
        <div className="runtime-consumers"><span className="map-column-label">Interfaces & experience</span><ArchitectureNode icon={Code2} tone="cyan" eyebrow="Stable boundary" title="Solution-owned APIs" detail="Contracts, profile policy, execution telemetry and audit" tags={['REST + SSE']} compact /><ArchitectureNode icon={Bot} tone="violet" eyebrow="Bundled Magenta" title="Agent orchestration" detail="Plan, authorize, retrieve, rerank, cite and review" tags={['profile-bound']} compact /><ArchitectureNode icon={Workflow} tone="green" eyebrow="Next.js solution" title="Safety Investigation Room" detail="Visual evidence, hypotheses and expert decisions" tags={['human in control']} compact /></div>
      </div>
    </section>

    <div className="architecture-boundary-row"><div><b>CDISC responsibility</b><p>Study structure, variable meaning, controlled terminology, validation and submission lineage.</p></div><ArrowRight /><div><b>Document-model responsibility</b><p>Application-shaped aggregates, selective denormalization, multi-modal projections and low-latency interaction.</p></div><ArrowRight /><div><b>Semantic-runtime responsibility</b><p>Meaning, containment, storage resolution, profile authorization and portable query contracts.</p></div><ArrowRight /><div><b>Agent responsibility</b><p>Orchestrate allowed tools and synthesize cited hypotheses—never replace evidence or expert judgment.</p></div></div>
  </div>;
}

function ArchitectureNode({ icon: Icon, tone, eyebrow, title, detail, tags, compact = false }: { icon: typeof Database; tone: string; eyebrow: string; title: string; detail: string; tags: string[]; compact?: boolean }) {
  return <article className={`architecture-node tone-${tone} ${compact ? 'compact' : ''}`}><div className="architecture-node-icon"><Icon size={18} /></div><div><span>{eyebrow}</span><h3>{title}</h3><p>{detail}</p><footer>{tags.map((tag) => <em key={tag}>{tag}</em>)}</footer></div></article>;
}

function FlowArrow({ label }: { label: string }) {
  return <div className="flow-arrow"><ArrowRight size={17} /><span>{label}</span></div>;
}

function DataModel({ evidence, runtime }: { evidence: StudyEvidence; runtime: SemanticRuntimeView }) {
  const bindings = new Map(runtime.storageBindings.map((binding) => [binding.semanticObject, binding]));
  return <div className="data-model-view">
    <div className="model-definition"><div><span className="panel-kicker">The modeling decision</span><h2>Preserve the standard. Project for the workload.</h2><p>The source SEND domains remain attributable and replayable. A snapshot-bound document places the fields needed together for the investigation screen, while independent projections add vectors, graph edges, semantics, and review state.</p></div><div className="model-equation"><span>CDISC facts</span><b>+</b><span>semantic bindings</span><b>+</b><span>AI projections</span><b>=</b><strong>operational evidence</strong></div></div>
    <section className="domain-map-panel"><header><div><span className="panel-kicker">Standards mapping</span><h2>Where CDISC SEND is used</h2></div><span>{evidence.study.implementationGuide}</span></header><div className="domain-map-head"><span>CDISC domain</span><span>Meaning</span><span>Semantic object</span><span>MongoDB representation</span><span>Business use</span></div>{domainMappings.map((mapping) => <div className="domain-map-row" key={mapping.domain}><b>{mapping.domain}</b><span>{mapping.source}</span><span>{mapping.object}</span><code>{bindings.get(mapping.object.split(' + ')[0])?.location || mapping.path}<small>{mapping.path}</small></code><span>{mapping.purpose}</span></div>)}</section>
    <div className="document-model-grid">
      <article className="document-shape"><header><div><span className="panel-kicker">Primary operational read model</span><h2>StudyEvidence document</h2></div><em>rebuildable · digest verified</em></header><pre><code>{`{
  study: {
    id: "${evidence.study.id}",
    snapshotId: "${evidence.study.snapshotId}",
    implementationGuide: "${evidence.study.implementationGuide}"
  },
  doseGroups: [{ code, dose, unit, animalCount }],     // TX
  signals: [{ organ, finding, incidence, severity }], // MI
  labSeries: { testCode: { unit, points[] } },         // LB
  provenance: {
    evidencePackageId, projectionVersion,
    projectionDigest, reconciliation, projectionRuleIds
  }
}`}</code></pre><footer><Database size={13} /> Embedded where data is read together; referenced where lifecycle or cardinality differs.</footer></article>
      <article className="projection-stack"><header><span className="panel-kicker">Independent, rebuildable projections</span><h2>Enrichment without evidence mutation</h2></header><div><Search size={15} /><span><b>Search documents</b><small>Normalized text, facets and source references</small></span><code>evidence_chunks</code></div><div><Sparkles size={15} /><span><b>Embedding vectors</b><small>Semantic similarity over findings and permitted passages</small></span><code>embedding[1536]</code></div><div><GitBranch size={15} /><span><b>Materialized relationships</b><small>Finding → publication → passage and evidence lineage</small></span><code>semantic_evidence_edges</code></div><div><ShieldCheck size={15} /><span><b>Expert workflow</b><small>Hypotheses and decisions remain separate from observations</small></span><code>investigations · review_actions</code></div></article>
    </div>
    <div className="model-rules"><article><b>Fidelity</b><p>Every derived fact carries study, snapshot, domain and source lineage back to the CDISC artifact.</p></article><article><b>Workload fit</b><p>The application does not repeatedly reconstruct one visual question from many tabular domain joins.</p></article><article><b>Evolution</b><p>New embeddings, relationships or terminology mappings are additive projections, not changes to source evidence.</p></article><article><b>Portability</b><p>Archetypes and storage bindings keep semantic meaning independent from one physical representation.</p></article></div>
  </div>;
}

function Interfaces({ selectedApi, onSelectApi }: { selectedApi: number; onSelectApi: (index: number) => void }) {
  const selected = apiContracts[selectedApi];
  const queryStages = [['01', 'Authorize & scope', 'profile · study · snapshot'], ['02', 'Compile containment', 'semantic archetype → MongoDB plan'], ['03', 'Retrieve in parallel', 'exact · lexical · vector · graph'], ['04', 'Fuse & rerank', 'RRF + domain-aware relevance'], ['05', 'Hydrate & cite', 'canonical records + source locators'], ['06', 'Agent + expert', 'hypothesis · review · append action']];
  return <div className="interfaces-view">
    <div className="api-workbench"><section className="api-list"><header><span className="panel-kicker">Solution-owned interfaces</span><h2>Operational APIs</h2><p>The browser never calls Kehrnel, Context Studio, MongoDB, or Magenta directly.</p></header>{apiContracts.map((api, index) => <button className={selectedApi === index ? 'active' : ''} key={api.path} onClick={() => onSelectApi(index)}><em>{api.method}</em><span><b>{api.title}</b><code>{api.path}</code></span><ArrowRight size={13} /></button>)}</section><section className="api-inspector"><div className="api-method"><span>{selected.method}</span><code>{selected.path}</code></div><h2>{selected.title}</h2><dl><div><dt>Input contract</dt><dd>{selected.input}</dd></div><div><dt>Response contract</dt><dd>{selected.output}</dd></div><div><dt>Governance</dt><dd>{selected.policy}</dd></div></dl><div className="api-boundary"><ShieldCheck size={16} /><p><b>Why the API boundary matters</b>The route resolves the active semantic release and profile, applies solution policy, and returns an auditable response. Storage and agent internals stay replaceable.</p></div></section></div>
    <section className="query-pipeline"><header><div><span className="panel-kicker">Hybrid evidence resolution</span><h2>One question, several complementary retrieval modes</h2><p>Exact CDISC facts remain authoritative. Similarity and graph results discover context; reranking prioritizes it; citations reconnect the answer to evidence.</p></div></header><div>{queryStages.map(([number, title, detail], index) => <article key={number}><span>{number}</span><b>{title}</b><small>{detail}</small>{index < queryStages.length - 1 && <ArrowRight size={15} />}</article>)}</div></section>
    <div className="interface-separation"><article><Database size={16} /><div><b>Structured truth</b><p>Aggregation returns incidence, dose, severity, laboratory values and identifiers without generative interpretation.</p></div></article><article><Network size={16} /><div><b>Context discovery</b><p>Search, vectors and graph traversal locate semantically related evidence that exact keys alone cannot reveal.</p></div></article><article><Bot size={16} /><div><b>Governed synthesis</b><p>Magenta can only invoke capabilities granted by the compiled profile and must emit citations.</p></div></article></div>
  </div>;
}

function ArchitectureValue() {
  const benefits = [{ icon: FileCheck2, title: 'Standards fidelity', detail: 'SEND terminology, domains, variables, validation state and source lineage remain explicit.' }, { icon: Database, title: 'Application-shaped performance', detail: 'Documents colocate the facts needed by each screen while preserving stable identifiers.' }, { icon: Sparkles, title: 'AI-ready by projection', detail: 'Embeddings and chunks can evolve independently and be rebuilt from governed evidence.' }, { icon: GitBranch, title: 'Connected evidence', detail: 'Graph edges cross studies, findings, subjects, literature, concepts and source artifacts.' }, { icon: ShieldCheck, title: 'Governed agents', detail: 'Profiles constrain semantic visibility, tool access, field masks and allowed actions.' }, { icon: Zap, title: 'Live semantics', detail: 'Versioned releases and Change Streams update maps and value sets without rewriting evidence.' }];
  return <div className="architecture-value-view">
    <div className="value-formula"><div><FileText size={20} /><span><small>Meaning</small><b>CDISC SEND</b></span></div><b>+</b><div><Database size={20} /><span><small>Operational shape</small><b>MongoDB documents</b></span></div><b>+</b><div><Waypoints size={20} /><span><small>Context</small><b>Semantic runtime</b></span></div><b>+</b><div><Bot size={20} /><span><small>Interaction</small><b>Magenta agents</b></span></div><b>=</b><strong>Explainable safety intelligence</strong></div>
    <div className="benefit-grid">{benefits.map(({ icon: Icon, title, detail }) => <article key={title}><Icon size={18} /><div><h2>{title}</h2><p>{detail}</p></div></article>)}</div>
    <section className="truth-model"><header><span className="panel-kicker">A deliberate separation of truth</span><h2>One evidence chain, different responsibilities</h2></header><div><article><span>Observed evidence</span><b>CDISC-derived snapshots</b><p>Immutable facts that answer what was observed in the study.</p></article><article><span>Derived retrieval</span><b>Chunks, vectors and edges</b><p>Rebuildable indexes that answer where relevant context may exist.</p></article><article><span>Semantic contract</span><b>Concepts, archetypes and resolvers</b><p>Versioned meaning that answers what can be combined and how.</p></article><article><span>Expert state</span><b>Investigations and decisions</b><p>Append-only workflow that records what humans concluded or requested next.</p></article></div></section>
    <div className="architecture-outcome"><Sparkles size={18} /><p><b>The strategic benefit:</b> the solution gains AI and search flexibility without denormalizing away the standard, mixing literature with observed study evidence, or giving an agent ungoverned access to the database.</p></div>
  </div>;
}
