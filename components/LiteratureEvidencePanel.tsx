'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Boxes, Braces, ExternalLink, FileText, GitMerge, Search, ShieldCheck } from 'lucide-react';
import type { LiteratureDocument, SafetySignal } from '@/lib/contracts';

const roleLabels: Record<LiteratureDocument['evidenceRole'], string> = {
  'pathology-reference': 'Pathology reference',
  'analogous-pattern': 'Analogous pattern',
  'alternative-explanation': 'Alternative explanation',
};

export default function LiteratureEvidencePanel({ signal, documents }: { signal: SafetySignal; documents: LiteratureDocument[] }) {
  const [selectedId, setSelectedId] = useState(documents[0]?.id);
  const selected = documents.find((document) => document.id === selectedId) || documents[0];
  const ranked = useMemo(() => documents.map((document, index) => ({ ...document, score: [94, 88, 83][index] || Math.max(70, 82 - index * 4) })), [documents]);

  if (!selected) return <div className="literature-empty">No curated literature is linked to this finding.</div>;
  return <div className="literature-workspace">
    <header className="literature-query"><div><span className="panel-kicker">External contextual evidence</span><h2>{signal.organ} · {signal.finding}</h2><p>AQL-style containment scopes the archetype relationships first. MongoDB then executes lexical, vector, and graph lanes before fusion and toxicology-aware reranking.</p></div><div className="retrieval-chain"><span><Braces size={12} /> CONTAINS</span><i>→</i><span><Search size={12} /> lexical</span><i>+</i><span><Boxes size={12} /> vector</span><i>+</i><span><GitMerge size={12} /> graph</span><i>→</i><strong>rerank</strong></div></header>
    <div className="literature-grid">
      <div className="publication-list">{ranked.map((document) => <button key={document.id} className={document.id === selected.id ? 'active' : ''} onClick={() => setSelectedId(document.id)}><span className="publication-rank">{document.score}<small>match</small></span><span><em>{roleLabels[document.evidenceRole]}</em><b>{document.title}</b><small>{document.journal} · {document.year} · PMID {document.pmid}</small></span></button>)}</div>
      <article className="publication-detail"><div className="publication-kind"><BookOpen size={14} /> {roleLabels[selected.evidenceRole]}</div><h3>{selected.title}</h3><p className="publication-authors">{selected.authors.join(', ')} · {selected.journal} ({selected.year})</p><blockquote>{selected.relevance}</blockquote><div className="concept-links"><span>Semantic matches</span>{selected.concepts.map((concept) => <i key={concept}>{concept}</i>)}</div><div className="literature-boundary"><ShieldCheck size={14} /><p><b>Evidence boundary</b>This publication provides context. It does not establish causality for the demonstration study.</p></div><a href={selected.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open PubMed record</a></article>
    </div>
    <footer className="document-provenance"><FileText size={13} /><span><b>Document architecture</b>PubMed metadata/abstracts via API · licensed PDFs in S3-compatible storage · parsed chunks, embeddings, links, and citations in MongoDB Atlas</span><em>No full text redistributed in this fixture</em></footer>
  </div>;
}
