'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { ArrowRight, ScanSearch } from 'lucide-react';
import type { DoseGroup, SafetySignal } from '@/lib/contracts';

function intensity(rate: number): string {
  if (rate === 0) return 'matrix-zero';
  if (rate <= 25) return 'matrix-low';
  if (rate <= 50) return 'matrix-medium';
  return 'matrix-high';
}

export default function SignalMatrix({
  groups,
  signals,
  selectedId,
  onSelect,
}: {
  groups: DoseGroup[];
  signals: SafetySignal[];
  selectedId: string;
  onSelect: (signalId: string) => void;
}) {
  const matrixRef = useRef<HTMLDivElement>(null);
  const gridStyle = { gridTemplateColumns: `minmax(250px, 1.7fr) repeat(${groups.length}, minmax(58px, .52fr)) minmax(125px, .8fr)`, minWidth: `${Math.max(760, 405 + groups.length * 65)}px` } as CSSProperties;
  useEffect(() => {
    matrixRef.current?.querySelector<HTMLElement>('.matrix-row.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);
  return (
    <div ref={matrixRef} className="signal-matrix" role="grid" aria-label={`Signal incidence by organ and dose group, ${signals.length} findings`} tabIndex={0}>
      <div className="matrix-header" role="row" style={gridStyle}>
        <span role="columnheader">Finding</span>
        {groups.map((group) => <span role="columnheader" key={group.code} title={group.label}><b>{group.dose}</b><small>{group.code} · {group.unit}</small></span>)}
        <span role="columnheader">Pattern</span>
      </div>
      {signals.map((signal) => (
        <button
          type="button"
          role="row"
          aria-selected={signal.id === selectedId}
          className={`matrix-row ${signal.id === selectedId ? 'selected' : ''}`}
          key={signal.id}
          onClick={() => onSelect(signal.id)}
          style={gridStyle}
        >
          <span className="matrix-finding" role="rowheader"><i><ScanSearch size={13} /></i><span><b>{signal.organ}</b><small>{signal.finding}</small></span></span>
          {groups.map((group, index) => {
            const affected = signal.incidence[index] || 0;
            const rate = Math.round((affected / group.animalCount) * 100);
            return <span className={`matrix-cell ${intensity(rate)}`} key={group.code} aria-label={`${group.dose} ${group.unit}: ${affected} of ${group.animalCount} animals`}><b>{affected}/{group.animalCount}</b><small>{rate}%</small></span>;
          })}
          <span className="matrix-pattern"><b>{signal.pattern.replaceAll('-', ' ')}</b><ArrowRight size={13} /></span>
        </button>
      ))}
      <div className="matrix-legend"><span><i className="matrix-zero" /> No finding</span><span><i className="matrix-low" /> ≤25%</span><span><i className="matrix-medium" /> 26–50%</span><span><i className="matrix-high" /> &gt;50%</span></div>
    </div>
  );
}
