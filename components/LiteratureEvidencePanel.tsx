'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Boxes, Braces, Database, ExternalLink, FileText, GitMerge, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import type { LiteratureDocument, LiteratureQueryExecution, LiteratureQueryResponse, RankedLiteratureDocument, RetrievalStageResult, SafetySignal, SemanticProfileId } from '@/lib/contracts';

const roleLabels: Record<LiteratureDocument['evidenceRole'], string> = {
  'pathology-reference': 'Pathology reference',
  'analogous-pattern': 'Analogous pattern',
  'alternative-explanation': 'Alternative explanation',
};

function initialRanking(documents: LiteratureDocument[]): RankedLiteratureDocument[] {
  return documents.map((document, index) => ({ ...document, retrieval: { rank: index + 1, score: [94, 88, 83][index] || Math.max(70, 82 - index * 4), lanes: ['containment'], source: 'portable-bundle' } }));
}

function stage(execution: LiteratureQueryExecution | null, id: RetrievalStageResult['id']) {
  return execution?.stages.find((item) => item.id === id);
}

export default function LiteratureEvidencePanel({ signal, documents, profileId }: { signal: SafetySignal; documents: LiteratureDocument[]; profileId: SemanticProfileId }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.id);
  const [ranked, setRanked] = useState<RankedLiteratureDocument[]>(() => initialRanking(documents));
  const [execution, setExecution] = useState<LiteratureQueryExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const selected = ranked.find((document) => document.id === selectedId) || ranked[0];
  const query = useMemo(() => `${signal.organ} ${signal.finding}`, [signal.finding, signal.organ]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/literature?signalId=${encodeURIComponent(signal.id)}&profile=${encodeURIComponent(profileId)}&q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as LiteratureQueryResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Literature retrieval failed');
        setRanked(payload.documents);
        setExecution(payload.execution);
        setSelectedId((current) => payload.documents.some((document) => document.id === current) ? current : payload.documents[0]?.id);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setExecution(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileId, query, signal.id]);

  if (!selected) return <div className="literature-empty">No curated literature is linked to this finding.</div>;
  const lexical = stage(execution, 'lexical');
  const vector = stage(execution, 'vector');
  const graph = stage(execution, 'graph');
  return <div className="literature-workspace">
    <header className="literature-query"><div><span className="panel-kicker">External contextual evidence</span><h2>{signal.organ} · {signal.finding}</h2><p>AQL-style containment scopes the archetype relationships first. MongoDB then executes lexical, vector, and graph lanes before fusion and toxicology-aware reranking.</p></div><div><div className="retrieval-chain"><span className="stage-executed"><Braces size={12} /> CONTAINS</span><i>→</i><span className={`stage-${lexical?.status || 'skipped'}`} title={lexical?.detail}><Search size={12} /> lexical</span><i>+</i><span className={`stage-${vector?.status || 'skipped'}`} title={vector?.detail}><Boxes size={12} /> vector</span><i>+</i><span className={`stage-${graph?.status || 'skipped'}`} title={graph?.detail}><GitMerge size={12} /> graph</span><i>→</i><strong>rerank</strong></div><div className="execution-state">{loading ? <><LoaderCircle size={10} className="spin" /> resolving contract</> : execution ? <><Database size={10} /> {execution.mode} · {execution.durationMs} ms · {execution.source}</> : <>portable evidence</>}</div></div></header>
    <div className="literature-grid">
      <div className="publication-list">{ranked.map((document) => <button key={document.id} className={document.id === selected.id ? 'active' : ''} onClick={() => setSelectedId(document.id)}><span className="publication-rank">{document.retrieval.score}<small>match</small></span><span><em>{roleLabels[document.evidenceRole]}</em><b>{document.title}</b><small>{document.journal} · {document.year} · PMID {document.pmid}</small><span className="retrieval-lanes">{document.retrieval.lanes.join(' · ')}</span></span></button>)}</div>
      <article className="publication-detail"><div className="publication-kind"><BookOpen size={14} /> {roleLabels[selected.evidenceRole]}</div><h3>{selected.title}</h3><p className="publication-authors">{selected.authors.join(', ')} · {selected.journal} ({selected.year})</p><blockquote>{selected.relevance}</blockquote><div className="concept-links"><span>Semantic matches</span>{selected.concepts.map((concept) => <i key={concept}>{concept}</i>)}</div><div className="literature-boundary"><ShieldCheck size={14} /><p><b>Evidence boundary</b>This publication provides context. It does not establish causality for the demonstration study.</p></div><a href={selected.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open PubMed record</a></article>
    </div>
    <footer className="document-provenance"><FileText size={13} /><span><b>Document architecture</b>PubMed metadata/abstracts via API · licensed PDFs in S3-compatible storage · parsed chunks, embeddings, links, and citations in MongoDB Atlas</span><em>{execution ? `${execution.semanticReleaseId} · ${execution.profileId}` : 'No full text redistributed in this fixture'}</em></footer>
  </div>;
}
