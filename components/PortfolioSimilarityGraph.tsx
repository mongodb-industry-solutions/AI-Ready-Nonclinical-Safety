'use client';

import { useMemo } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PortfolioSimilarityResult } from '@/lib/contracts';

type PortfolioNodeData = {
  label: string;
  meta: string;
  score?: number;
  evidenceClass: string;
  query?: boolean;
};

function PortfolioNode({ data }: NodeProps<Node<PortfolioNodeData>>) {
  return <div className={`portfolio-node ${data.query ? 'query' : ''} ${data.evidenceClass === 'synthetic-benchmark' ? 'synthetic' : 'observed'}`}>
    <Handle type="target" position={Position.Left} />
    <span>{data.query ? 'Query signal' : data.evidenceClass === 'synthetic-benchmark' ? 'Synthetic benchmark' : 'Observed evidence'}</span>
    <strong>{data.label}</strong>
    <small>{data.meta}</small>
    {data.score !== undefined && <em>{data.score}%</em>}
    <Handle type="source" position={Position.Right} />
  </div>;
}

const nodeTypes = { portfolio: PortfolioNode };

export default function PortfolioSimilarityGraph({ result, selectedId, onSelect }: { result: PortfolioSimilarityResult; selectedId: string; onSelect: (id: string) => void }) {
  const nodes = useMemo<Array<Node<PortfolioNodeData>>>(() => {
    const query: Node<PortfolioNodeData> = {
      id: 'query',
      type: 'portfolio',
      position: { x: 40, y: 185 },
      data: { label: result.query.signal.organ, meta: result.query.signal.finding, evidenceClass: result.query.study.evidenceClass || 'sponsor-observed', query: true },
    };
    const matches = result.matches.slice(0, 6).map((match, index) => ({
      id: match.id,
      type: 'portfolio',
      position: { x: 420 + (index % 2) * 310, y: 20 + Math.floor(index / 2) * 165 },
      selected: match.id === selectedId,
      data: { label: `${match.signal.organ} · ${match.score}%`, meta: match.study.title, score: match.score, evidenceClass: match.evidenceClass },
    } satisfies Node<PortfolioNodeData>));
    return [query, ...matches];
  }, [result, selectedId]);
  const edges = useMemo<Array<Edge>>(() => result.matches.slice(0, 6).map((match) => ({
    id: `query-${match.id}`,
    source: 'query',
    target: match.id,
    label: `${match.score}%`,
    animated: match.rank <= 2,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: match.rank <= 2 ? 'var(--green-45)' : 'var(--line-25)', strokeWidth: 1 + match.score / 45 },
    labelStyle: { fill: 'var(--ink-56)', fontSize: 11 }, labelBgStyle: { fill: 'var(--surface-8)', fillOpacity: .88 }, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4,
  })), [result]);

  return <div className="portfolio-graph-canvas">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.45} maxZoom={1.45} nodesConnectable={false} nodesDraggable={false} onNodeClick={(_, node) => node.id !== 'query' && onSelect(node.id)}>
      <Background color="var(--surface-16)" gap={22} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
