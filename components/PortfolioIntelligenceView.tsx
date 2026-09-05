'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Beaker, BrainCircuit, CircleDot, FlaskConical, GitCompareArrows, Network, ScanSearch, Sparkles } from 'lucide-react';
import type { PortfolioSimilarityResult, SemanticProfileId, StudyEvidence } from '@/lib/contracts';
import { comparePortfolio } from '@/lib/analysis/portfolio-similarity';
import PortfolioSimilarityGraph from '@/components/PortfolioSimilarityGraph';

function evidenceLabel(value: string) {
  if (value === 'synthetic-benchmark') return 'Synthetic benchmark';
  if (value === 'observed-public') return 'Observed · public';
  return 'Observed · sponsor';
}

export default function PortfolioIntelligenceView({ evidence, evidenceSet, profileId, semanticReleaseId }: { evidence: StudyEvidence; evidenceSet: StudyEvidence[]; profileId: SemanticProfileId; semanticReleaseId: string }) {
  const [signalId, setSignalId] = useState(evidence.signals[0].id);
  const initial = useMemo(() => comparePortfolio(evidenceSet, evidence.study.id, signalId, 8, semanticReleaseId), [evidenceSet, evidence.study.id, semanticReleaseId, signalId]);
  const [result, setResult] = useState<PortfolioSimilarityResult>(initial);
  const [selectedId, setSelectedId] = useState(initial.matches[0]?.id || '');
  const [state, setState] = useState<'ready' | 'querying' | 'fallback'>('ready');

  useEffect(() => {
    const controller = new AbortController();
    setState('querying');
    fetch(`/api/portfolio/similarity?studyId=${encodeURIComponent(evidence.study.id)}&signalId=${encodeURIComponent(signalId)}&profile=${encodeURIComponent(profileId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Similarity resolver unavailable');
        return response.json() as Promise<PortfolioSimilarityResult>;
      })
      .then((value) => {
        setResult(value);
        setSelectedId(value.matches[0]?.id || '');
        setState('ready');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setResult(initial);
        setSelectedId(initial.matches[0]?.id || '');
        setState('fallback');
      });
    return () => controller.abort();
  }, [evidence.study.id, initial, profileId, signalId]);

  const selected = result.matches.find((item) => item.id === selectedId) || result.matches[0];
  return <div className="portfolio-view" data-sherpa-state="portfolio">
    <section className="portfolio-hero">
      <div><span className="eyebrow">Cross-study portfolio intelligence</span><h1>Evidence similarity atlas</h1><p>Compare a governed SEND finding with portfolio evidence through semantic, dose-pattern, severity and Atlas Automated Embedding lanes—without confusing synthetic test scenarios with observed evidence.</p></div>
      <div className="portfolio-query">
        <label><ScanSearch size={14} /><span><small>Query finding</small><select value={signalId} onChange={(event) => setSignalId(event.target.value)}>{evidence.signals.map((signal) => <option key={signal.id} value={signal.id}>{signal.organ} · {signal.finding}</option>)}</select></span></label>
        <em className={state}>{state === 'querying' ? 'Resolving…' : state === 'fallback' ? 'Portable resolver' : 'Live resolver'}</em>
      </div>
    </section>

    <section className="portfolio-metrics">
      <article><Network size={15} /><div><span>Portfolio corpus</span><strong>{result.corpus.studies} studies</strong><small>{result.corpus.findings} governed findings</small></div></article>
      <article><BadgeCheck size={15} /><div><span>Observed evidence</span><strong>{result.corpus.observedStudies}</strong><small>source-labeled snapshots</small></div></article>
      <article><Beaker size={15} /><div><span>Evaluation corpus</span><strong>{result.corpus.syntheticStudies}</strong><small>synthetic benchmarks</small></div></article>
      <article><BrainCircuit size={15} /><div><span>Retrieval mode</span><strong>{result.execution.vectorLane === 'executed' ? '4 lanes' : '3 lanes'}</strong><small>{result.execution.vectorLane === 'executed' ? 'Atlas auto-embedding executed' : 'auto-embedding unavailable · not simulated'}</small></div></article>
    </section>

    <section className="portfolio-stage">
      <div className="portfolio-map-panel">
        <header><div><span className="panel-kicker">Explainable similarity network</span><h2>{result.query.signal.organ} evidence neighborhood</h2></div><span className="semantic-release"><CircleDot size={11} /> {result.execution.semanticReleaseId}</span></header>
        <PortfolioSimilarityGraph result={result} selectedId={selectedId} onSelect={setSelectedId} />
        <footer><span><i className="observed-dot" /> Observed</span><span><i className="synthetic-dot" /> Synthetic benchmark</span><b>Edge width = fused similarity</b></footer>
      </div>

      {selected && <aside className="portfolio-inspector">
        <div className="match-rank">#{selected.rank}<strong>{selected.score}%</strong><small>reranked match</small></div>
        <span className={`evidence-class ${selected.evidenceClass}`}>{evidenceLabel(selected.evidenceClass)}</span>
        <h2>{selected.signal.organ}</h2><p className="match-finding">{selected.signal.finding}</p>
        <div className="match-study"><FlaskConical size={13} /><span><b>{selected.study.title}</b><small>{selected.study.compoundName ? `${selected.study.compoundName} · ` : ''}{selected.study.species || 'Species not supplied'} · {selected.study.strain || 'strain not supplied'} · {selected.study.snapshotId}</small></span></div>
        <p className="match-explanation">{selected.explanation}</p>
        <div className="match-comparability"><span>Study comparability</span>{selected.comparability.map((dimension) => <div className={dimension.status} title={dimension.detail} key={dimension.id}><i /><span><b>{dimension.label}</b><small>{dimension.detail}</small></span><em>{dimension.status}</em></div>)}</div>
        <div className="lane-stack">{selected.lanes.map((lane) => <div key={lane.id} className={lane.status === 'skipped' ? 'skipped' : ''}><header><span>{lane.label}</span><b>{lane.score === null ? 'not run' : `${lane.score}%`}</b></header><i><span style={{ width: `${lane.score || 0}%` }} /></i><small>{lane.detail}</small></div>)}</div>
      </aside>}
    </section>

    <section className="portfolio-results panel">
      <header><div><span className="panel-kicker">RRF fusion + domain reranking</span><h2>Ranked evidence comparisons</h2></div><span><Sparkles size={12} /> Every score is decomposable</span></header>
      <div className="portfolio-result-head"><span>Rank / evidence</span><span>Finding</span><span>Semantic</span><span>Dose shape</span><span>Severity</span><span>Fused</span></div>
      {result.matches.map((match) => <button key={match.id} className={match.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(match.id)}>
        <span className="result-study"><em>#{match.rank}</em><span><b>{match.study.id}</b><small>{evidenceLabel(match.evidenceClass)}</small></span></span>
        <span className="result-finding"><b>{match.signal.organ}</b><small>{match.signal.finding}</small></span>
        {match.lanes.slice(0, 3).map((lane) => <span className="mini-score" key={lane.id}><i><span style={{ width: `${lane.score || 0}%` }} /></i><b>{lane.score}%</b></span>)}
        <strong className="fused-score">{match.score}</strong>
      </button>)}
    </section>

    <section className="portfolio-execution panel">
      <header><div><span className="panel-kicker">Executed resolver evidence</span><h2>Actual query operations</h2></div><span>{result.execution.mode} · {result.execution.vectorLane}</span></header>
      <div>{result.execution.dataOperations.length ? result.execution.dataOperations.map((operation) => <article key={operation.id}><span><DatabaseIcon /><b>{operation.collection}.{operation.operation}</b></span><code>{JSON.stringify(operation.predicate)}</code><em className={operation.status}>{operation.status} · {operation.resultCount} rows · {operation.durationMs} ms{operation.plan ? ` · ${operation.plan.documentsExamined ?? '—'} examined · ${operation.plan.indexes.join(', ') || 'COLLSCAN'}` : ''}</em></article>) : <p>The portable preview calculated the same deterministic lanes; no MongoDB operation was executed.</p>}</div>
    </section>

    <section className="portfolio-boundary"><GitCompareArrows size={17} /><div><b>Evidence boundary enforced</b><p>{result.execution.boundary}</p></div><span>SMILES deferred until governed compound identity exists</span></section>
  </div>;
}

function DatabaseIcon() {
  return <CircleDot size={11} />;
}
