'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Braces, CornerDownLeft, FlaskConical, Layers3, Microscope, Search, Sparkles } from 'lucide-react';
import type { SemanticProfileId, StudyEvidence } from '@/lib/contracts';

interface SemanticHit {
  resourceType: string;
  resourceId: string;
  label: string;
  excerpt: string;
  score: number;
  lanes: Array<'lexical' | 'vector'>;
}

interface SearchResponse {
  mode?: 'atlas-hybrid' | 'atlas-search' | 'mongodb-exact' | 'portable-bundle';
  hits?: SemanticHit[];
  stages?: Array<{ id: string; status: string; detail: string }>;
}

type Entry =
  | { kind: 'finding'; id: string; title: string; subtitle: string; hint: string }
  | { kind: 'study'; id: string; title: string; subtitle: string; hint: string }
  | { kind: 'view'; id: string; title: string; subtitle: string; hint: string }
  | { kind: 'semantic'; id: string; title: string; subtitle: string; hint: string; lanes: Array<'lexical' | 'vector'> };

const modeLabel: Record<string, string> = {
  'atlas-hybrid': 'Atlas Search + Vector Search · reciprocal-rank fusion',
  'atlas-search': 'Atlas Search lexical lane',
  'mongodb-exact': 'Bounded MongoDB exact lane',
  'portable-bundle': 'Portable semantic bundle · no MongoDB connected',
};

const groupLabel: Record<Entry['kind'], string> = {
  finding: 'Findings in this study',
  study: 'Studies',
  view: 'Go to',
  semantic: 'Semantic map',
};

const groupIcon: Record<Entry['kind'], typeof Search> = {
  finding: Microscope,
  study: FlaskConical,
  view: Layers3,
  semantic: Braces,
};

export default function CommandPalette({
  open,
  onClose,
  evidence,
  studies,
  profileId,
  onSelectSignal,
  onSelectStudy,
  onOpenView,
  onOpenSemantic,
}: {
  open: boolean;
  onClose: () => void;
  evidence: StudyEvidence;
  studies: StudyEvidence[];
  profileId: SemanticProfileId;
  onSelectSignal: (signalId: string) => void;
  onSelectStudy: (studyId: string) => void;
  onOpenView: (view: 'journey' | 'workspace' | 'portfolio' | 'semantics' | 'architecture' | 'audit') => void;
  onOpenSemantic: (focusId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<SearchResponse>({});
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setRemote({});
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // The semantic lane is the governed API, so it is debounced and profile-scoped
  // exactly like the semantic model explorer rather than searched client-side.
  useEffect(() => {
    if (!open || query.trim().length < 2) { setRemote({}); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/semantics/search?q=${encodeURIComponent(query)}&profile=${profileId}&limit=6`, { signal: controller.signal, cache: 'no-store' });
        setRemote(response.ok ? await response.json() : {});
      } catch {
        // An aborted or failed lookup simply leaves the local lanes in place.
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, profileId, open]);

  const entries = useMemo<Entry[]>(() => {
    // Token matching, so "thymus lymphocyte" still finds "THYMUS · Decreased
    // number, lymphocytes, cortex" the way a reviewer would expect.
    const needles = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (...values: string[]) => {
      if (!needles.length) return true;
      const haystack = values.join(' ').toLowerCase();
      return needles.every((needle) => haystack.includes(needle) || haystack.includes(needle.replace(/s$/, '')));
    };

    const findings: Entry[] = evidence.signals
      .filter((signal) => matches(signal.organ, signal.finding, signal.pattern))
      .slice(0, 6)
      .map((signal) => ({
        kind: 'finding', id: signal.id, title: `${signal.organ} · ${signal.finding}`,
        subtitle: `${signal.affectedAnimals}/${signal.totalAnimals} animals · ${signal.pattern.replaceAll('-', ' ')}`,
        hint: signal.reviewPriority === 'high' ? 'review first' : signal.reviewPriority,
      }));

    const studyEntries: Entry[] = studies
      .filter((item) => item.study.id !== evidence.study.id && matches(item.study.title, item.study.id, item.study.compoundName || ''))
      .slice(0, 4)
      .map((item) => ({
        kind: 'study', id: item.study.id, title: item.study.title,
        subtitle: `${item.study.animalCount} animals · ${item.signals.length} findings`, hint: item.study.id,
      }));

    const views: Entry[] = ([
      ['workspace', 'Study workspace', 'Signal matrix, dose response and evidence graph'],
      ['portfolio', 'Portfolio similarity', 'Explainable cross-study comparison'],
      ['semantics', 'Semantic model', 'Business, graph, retrieval and physical lenses'],
      ['architecture', 'Solution architecture', 'Build-time and runtime boundaries'],
      ['audit', 'Audit & lineage', 'Provenance, checksums and review state'],
      ['journey', 'Guided journey', 'Seven-chapter walkthrough'],
    ] as const)
      .filter(([, title, subtitle]) => matches(title, subtitle))
      .map(([id, title, subtitle]) => ({ kind: 'view', id, title, subtitle, hint: 'view' }));

    const semantic: Entry[] = (remote.hits || []).map((hit) => ({
      kind: 'semantic', id: hit.resourceId, title: hit.label,
      subtitle: hit.excerpt.slice(0, 110), hint: hit.resourceType, lanes: hit.lanes,
    }));

    return [...findings, ...studyEntries, ...semantic, ...views];
  }, [query, evidence, studies, remote]);

  useEffect(() => { setActive(0); }, [entries.length]);

  if (!open) return null;

  const run = (entry: Entry) => {
    onClose();
    if (entry.kind === 'finding') { onOpenView('workspace'); onSelectSignal(entry.id); }
    if (entry.kind === 'study') onSelectStudy(entry.id);
    if (entry.kind === 'view') onOpenView(entry.id as 'workspace');
    if (entry.kind === 'semantic') onOpenSemantic(entry.id);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? active + 1 : active - 1;
      const bounded = (next + entries.length) % Math.max(entries.length, 1);
      setActive(bounded);
      listRef.current?.querySelectorAll('button')[bounded]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter' && entries[active]) { event.preventDefault(); run(entries[active]); }
  };

  let lastKind: Entry['kind'] | undefined;

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search findings, studies and the semantic map" onMouseDown={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search findings, studies, concepts…"
            aria-label="Search findings, studies and the semantic map"
            onChange={(event) => setQuery(event.target.value)}
          />
          {loading && <span className="palette-loading">searching…</span>}
          <kbd>esc</kbd>
        </div>

        <div className="palette-results" ref={listRef}>
          {!entries.length && <p className="palette-empty">No findings, studies or semantic concepts match “{query}”.</p>}
          {entries.map((entry, index) => {
            const header = entry.kind !== lastKind ? groupLabel[entry.kind] : undefined;
            lastKind = entry.kind;
            const Icon = groupIcon[entry.kind];
            return (
              <div key={`${entry.kind}:${entry.id}:${index}`}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  className={index === active ? 'active' : ''}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(entry)}
                >
                  <span className="palette-icon" data-kind={entry.kind}><Icon size={15} /></span>
                  <span className="palette-copy"><b>{entry.title}</b><small>{entry.subtitle}</small></span>
                  {entry.kind === 'semantic' && entry.lanes?.length
                    ? <span className="palette-lanes">{entry.lanes.map((lane) => <i key={lane} data-lane={lane}>{lane}</i>)}</span>
                    : <em>{entry.hint}</em>}
                  {index === active && <CornerDownLeft size={13} className="palette-enter" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* The palette is also the shortest honest explanation of the retrieval
            architecture: it names the lane that actually served these results. */}
        <footer className="palette-footer">
          <span><Sparkles size={12} /> {remote.mode ? modeLabel[remote.mode] : 'Local study index · type to query the governed semantic map'}</span>
          <span className="palette-keys"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</span>
        </footer>
      </div>
    </div>
  );
}
