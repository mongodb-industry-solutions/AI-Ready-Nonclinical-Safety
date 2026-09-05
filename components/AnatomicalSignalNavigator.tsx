'use client';

import { MapPin, MousePointer2 } from 'lucide-react';
import type { SafetySignal } from '@/lib/contracts';
import { resolveAnatomicalSite } from '@/lib/visualization/anatomical-sites';

const priorityRank: Record<SafetySignal['reviewPriority'], number> = { high: 4, medium: 3, context: 2, low: 1 };

export default function AnatomicalSignalNavigator({ signals, selectedId, species, onSelect }: { signals: SafetySignal[]; selectedId: string; species?: string; onSelect: (signalId: string) => void }) {
  const groups = [...signals.reduce((map, item) => {
    const organ = item.organ.trim().toUpperCase();
    const group = map.get(organ) || [];
    group.push(item);
    map.set(organ, group);
    return map;
  }, new Map<string, SafetySignal[]>())].map(([organ, findings], index) => ({
    organ,
    findings,
    position: resolveAnatomicalSite(organ, index),
    priority: [...findings].sort((a, b) => priorityRank[b.reviewPriority] - priorityRank[a.reviewPriority])[0].reviewPriority,
  }));
  const selected = signals.find((item) => item.id === selectedId) || signals[0];
  const selectedGroup = groups.find((group) => group.organ === selected.organ.trim().toUpperCase());
  const approximateCount = groups.filter((group) => group.position.approximate).length;

  function selectSite(findings: SafetySignal[]) {
    const activeIndex = findings.findIndex((item) => item.id === selectedId);
    onSelect(findings[(activeIndex + 1) % findings.length].id);
  }

  return <aside className="anatomical-map" aria-label={`Interactive anatomical signal navigator for ${species || 'the study species'}`}>
    <header><span className="panel-kicker">Anatomical navigator</span><b>{species || 'Study subject'} · observed sites</b><small>Select a marker; repeated selection cycles findings at that site.</small></header>
    <div className="anatomy-stage">
      <svg className="specimen-silhouette" viewBox="0 0 240 390" aria-hidden="true">
        <path className="specimen-tail" d="M61 260 C20 269 16 323 47 344 C66 358 86 346 75 329 C66 315 40 326 39 349" />
        <ellipse className="specimen-body" cx="112" cy="225" rx="67" ry="111" transform="rotate(-9 112 225)" />
        <path className="specimen-head" d="M129 123 C139 91 168 69 196 78 C216 84 225 103 211 119 C198 134 170 143 145 143 Z" />
        <circle className="specimen-ear" cx="164" cy="79" r="18" />
        <circle className="specimen-eye" cx="195" cy="96" r="3" />
        <path className="specimen-leg" d="M91 318 C88 343 87 361 76 374" /><path className="specimen-leg" d="M143 316 C151 341 155 357 169 369" />
        <path className="specimen-foot" d="M75 374 L55 378" /><path className="specimen-foot" d="M169 369 L188 373" />
      </svg>
      {groups.map((group) => {
        const isSelected = group.organ === selected.organ.trim().toUpperCase();
        return <button type="button" key={group.organ} className={`anatomy-marker ${isSelected ? 'selected' : ''}`} data-priority={group.priority} data-approximate={group.position.approximate || undefined} style={{ left: `${group.position.x}%`, top: `${group.position.y}%` }} onClick={() => selectSite(group.findings)} aria-label={`${group.organ}, ${group.findings.length} finding${group.findings.length === 1 ? '' : 's'}, ${group.position.region}`} title={`${group.organ} · ${group.findings.length} finding${group.findings.length === 1 ? '' : 's'}`}>
          <span />{group.findings.length > 1 && <em>{group.findings.length}</em>}<b>{group.organ}</b>
        </button>;
      })}
    </div>
    <section className="anatomy-selection"><MapPin size={13} /><div><b>{selected.organ}</b><span>{selected.finding}</span><small>{selectedGroup?.position.region} · {selectedGroup?.findings.length || 1} finding{(selectedGroup?.findings.length || 1) === 1 ? '' : 's'} at this site</small></div></section>
    <footer><span><MousePointer2 size={10} /> {groups.length}/{groups.length} observed sites shown</span><em>{approximateCount ? `${approximateCount} placed in “other” region` : 'schematic location'}</em></footer>
  </aside>;
}
