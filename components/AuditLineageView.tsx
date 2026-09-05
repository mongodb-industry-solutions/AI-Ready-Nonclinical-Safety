'use client';

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  Play,
  ShieldCheck,
} from 'lucide-react';
import type { SemanticRuntimeView, StudyEvidence } from '@/lib/contracts';

interface AuditLineageViewProps {
  evidence: StudyEvidence;
  runtime: SemanticRuntimeView;
  canInvestigate: boolean;
  onOpenInvestigation: () => void;
}

const shortDigest = (value: string) => value.replace(/^sha256:/, '').slice(0, 12);

export default function AuditLineageView({ evidence, runtime, canInvestigate, onOpenInvestigation }: AuditLineageViewProps) {
  const artifacts = Object.entries(evidence.provenance.sourceArtifacts || {});
  const flow = [
    { icon: FileCheck2, label: 'Public source', detail: `${artifacts.length} checksummed artifacts`, state: 'verified' },
    { icon: Database, label: 'Study snapshot', detail: evidence.study.snapshotId, state: 'immutable' },
    { icon: GitBranch, label: 'Semantic release', detail: runtime.release.version, state: 'active' },
    { icon: Bot, label: 'Resolver execution', detail: `${runtime.capabilities.length} governed capabilities`, state: 'profile gated' },
  ];

  return <section className="audit-page">
    <div className="audit-hero">
      <div><div className="eyebrow">Trust, replayability and accountability</div><h1>Audit & evidence lineage</h1><p>Trace every investigation from the public SEND artifact through its immutable study snapshot, semantic contract, governed resolver, and human review action.</p></div>
      <button className="primary-action" disabled={!canInvestigate} onClick={onOpenInvestigation}><Play size={14} /> Open investigation room</button>
    </div>

    <div className="audit-status-strip">
      <span><ShieldCheck size={15} /><b>Published snapshot</b><small>{evidence.study.state} · {evidence.study.implementationGuide}</small></span>
      <span><Fingerprint size={15} /><b>Source revision</b><small>{evidence.study.sourceRevision.slice(0, 12)}</small></span>
      <span><LockKeyhole size={15} /><b>Active policy</b><small>{runtime.activeProfile.label}</small></span>
      <span><GitBranch size={15} /><b>Semantic digest</b><small>{shortDigest(runtime.contentDigest)}</small></span>
    </div>

    <article className="lineage-panel">
      <header><div><span className="panel-kicker">Verified evidence chain</span><h2>From source evidence to expert decision</h2></div><span className="lineage-integrity"><CheckCircle2 size={14} /> Chain verified</span></header>
      <div className="lineage-flow">{flow.map(({ icon: Icon, label, detail, state }, index) => <div className="lineage-step" key={label}><div className="lineage-node"><Icon size={18} /></div><span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b><small>{detail}</small><em>{state}</em>{index < flow.length - 1 && <ArrowRight className="lineage-arrow" size={17} />}</div>)}</div>
    </article>

    <div className="audit-grid">
      <article className="audit-card artifact-ledger">
        <header><div><span className="panel-kicker">Source artifact ledger</span><h2>Replayable inputs</h2></div><a href={evidence.study.source} target="_blank" rel="noreferrer">Open source <ExternalLink size={12} /></a></header>
        <div className="artifact-table"><div className="artifact-head"><span>Artifact</span><span>Integrity</span><span>Digest</span></div>{artifacts.map(([name, digest]) => <div key={name}><b>{name}</b><span><CheckCircle2 size={11} /> SHA-256 verified</span><code>{shortDigest(digest)}…</code></div>)}</div>
        <footer>{evidence.provenance.method} · derived {evidence.provenance.derivedAt}</footer>
      </article>

      <article className="audit-card snapshot-record">
        <header><div><span className="panel-kicker">Immutable study snapshot</span><h2>{evidence.study.title}</h2></div><span className="snapshot-badge">published</span></header>
        <dl><div><dt>Study identifier</dt><dd>{evidence.study.id}</dd></div><div><dt>Snapshot</dt><dd>{evidence.study.snapshotId}</dd></div><div><dt>Canonical records</dt><dd>{evidence.study.recordCount.toLocaleString()}</dd></div><div><dt>SEND domains</dt><dd>{evidence.study.domains.join(' · ')}</dd></div><div><dt>Source license</dt><dd>{evidence.study.license}</dd></div><div><dt>Revision</dt><dd>{evidence.study.sourceRevision.slice(0, 12)}</dd></div></dl>
      </article>
    </div>

    <div className="governance-grid">
      <article><LockKeyhole size={17} /><div><b>Evidence cannot be rewritten</b><p>{runtime.governance.evidenceCollections.length} evidence collections are read-only to the investigation runtime.</p></div></article>
      <article><Bot size={17} /><div><b>Resolvers are profile-gated</b><p>{runtime.activeProfile.label} can invoke {runtime.capabilities.length} capabilities exposed by this semantic release.</p></div></article>
      <article><FileCheck2 size={17} /><div><b>Review state is separated</b><p>Human decisions append only to {runtime.governance.solutionWriteCollections.join(', ')}; source evidence remains untouched.</p></div></article>
      <article><Fingerprint size={17} /><div><b>Every result remains attributable</b><p>Hydrated records retain snapshot, source reference, semantic release, and resolver provenance.</p></div></article>
    </div>

    <p className="audit-disclaimer">{evidence.provenance.disclaimer}</p>
  </section>;
}
