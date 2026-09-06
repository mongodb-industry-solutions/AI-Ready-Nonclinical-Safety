'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { LiteratureQueryExecution, RankedLiteratureDocument } from '@/lib/contracts';

export default function LiteratureDocumentViewer({ document, execution }: { document: RankedLiteratureDocument; execution: LiteratureQueryExecution | null }) {
  const [loading, setLoading] = useState(Boolean(document.fullText));
  const pdfPath = document.fullText ? `/api/literature/${encodeURIComponent(document.id)}/pdf` : undefined;

  useEffect(() => setLoading(Boolean(document.fullText)), [document.fullText, document.id]);

  return <article className="literature-inspector literature-document-viewer">
    <div className="literature-viewer-summary">
      <span>{document.evidenceRole.replaceAll('-', ' ')}</span>
      <p>{document.authors.join(', ')}</p>
      <blockquote>{document.relevance}</blockquote>
      <div>{document.concepts.map((concept) => <i key={concept}>{concept}</i>)}</div>
    </div>
    {document.fullText && pdfPath ? <>
      <div className="literature-viewer-toolbar">
        <span><FileText size={13} /><b>Full PDF</b><small>{document.fullText.provider} · {document.fullText.license}</small></span>
        <a href={pdfPath} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open full size</a>
        <a href={document.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> PubMed</a>
      </div>
      <div className="literature-pdf-frame">
        {loading && <div className="literature-pdf-loading"><LoaderCircle className="spin" size={18} /><span><b>Loading verified full text</b><small>The PDF remains hosted by {document.fullText.provider} and is streamed on demand.</small></span></div>}
        <iframe title={`Full text: ${document.title}`} src={`${pdfPath}#view=FitH&toolbar=1&navpanes=0`} onLoad={() => setLoading(false)} />
      </div>
      <footer><ShieldCheck size={12} /><span>Open-access source verified {new Date(document.fullText.verifiedAt).toLocaleDateString()} · contextual evidence, not causal proof</span><em>{execution?.mode || 'curated evidence'}</em></footer>
    </> : <div className="literature-fulltext-unavailable">
      <FileText size={24} /><h4>Full text is not licensed for in-app display</h4><p>The citation and application-authored relevance summary remain available. Use PubMed to follow publisher access.</p>
      <a href={document.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open PubMed record</a>
    </div>}
  </article>;
}
