import { NextResponse } from 'next/server';
import { allLiterature } from '@/lib/data/literature-repository';

export const dynamic = 'force-dynamic';

const ALLOWED_FULL_TEXT_HOSTS = new Set(['europepmc.org', 'www.europepmc.org']);

async function streamPdf(request: Request, context: { params: Promise<{ documentId: string }> }, headOnly = false) {
  const { documentId: encodedDocumentId } = await context.params;
  const documentId = decodeURIComponent(encodedDocumentId);
  const document = allLiterature().find((candidate) => candidate.id === documentId);
  if (!document) return NextResponse.json({ error: 'Literature document not found' }, { status: 404 });
  if (!document.fullText || document.fullText.format !== 'pdf') {
    return NextResponse.json({ error: 'A licensed or open-access PDF is not available for this document' }, { status: 404 });
  }

  const source = new URL(document.fullText.pdfUrl);
  if (source.protocol !== 'https:' || !ALLOWED_FULL_TEXT_HOSTS.has(source.hostname)) {
    return NextResponse.json({ error: 'The full-text provider is not approved' }, { status: 403 });
  }

  const range = request.headers.get('range');
  const upstream = await fetch(source, {
    method: headOnly ? 'HEAD' : 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/pdf',
      ...(range ? { range } : {}),
      'user-agent': 'AI-Ready-Nonclinical-Safety/1.0 literature-viewer',
    },
    signal: request.signal,
  });
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: 'The full-text provider could not supply this PDF' }, { status: 502 });
  }

  const headers = new Headers({
    'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    'content-disposition': `inline; filename="${document.pmid}.pdf"`,
    'content-type': 'application/pdf',
    'x-content-type-options': 'nosniff',
    'x-literature-license': document.fullText.license,
    'x-literature-provider': document.fullText.provider,
  });
  for (const name of ['accept-ranges', 'content-length', 'content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(headOnly ? null : upstream.body, { status: upstream.status, headers });
}

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return streamPdf(request, context);
}

export async function HEAD(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return streamPdf(request, context, true);
}
