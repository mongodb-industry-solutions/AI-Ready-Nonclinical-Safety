'use client';

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SafetySignal, StudyEvidence } from '@/lib/contracts';

type EvidenceNodeData = { label: string; meta: string; tone: 'study' | 'finding' | 'animal' | 'lab' | 'source' };

function EvidenceNode({ data }: NodeProps<Node<EvidenceNodeData>>) {
  return <div className={`evidence-node tone-${data.tone}`}><Handle type="target" position={Position.Left} /><strong>{data.label}</strong><span>{data.meta}</span><Handle type="source" position={Position.Right} /></div>;
}

const nodeTypes = { evidence: EvidenceNode };

export default function EvidenceGraph({ evidence, signal }: { evidence: StudyEvidence; signal: SafetySignal }) {
  const nodes: Array<Node<EvidenceNodeData>> = [
    { id: 'study', type: 'evidence', position: { x: 10, y: 145 }, data: { label: evidence.study.id, meta: evidence.study.snapshotId, tone: 'study' } },
    { id: 'dose', type: 'evidence', position: { x: 220, y: 30 }, data: { label: 'Treatment groups', meta: 'TX · 0–12 mg/kg', tone: 'source' } },
    { id: 'finding', type: 'evidence', position: { x: 220, y: 145 }, data: { label: signal.organ, meta: signal.finding, tone: 'finding' } },
    { id: 'animals', type: 'evidence', position: { x: 460, y: 92 }, data: { label: `${signal.affectedAnimals} supporting animals`, meta: 'DM · identity + group', tone: 'animal' } },
    { id: 'lab', type: 'evidence', position: { x: 460, y: 210 }, data: { label: signal.correlatedLab || 'Context measures', meta: signal.correlatedLab ? 'LB · longitudinal evidence' : 'No direct lab correlate', tone: 'lab' } },
    { id: 'artifact', type: 'evidence', position: { x: 710, y: 145 }, data: { label: 'Source evidence', meta: 'XPT + Define-XML + SHA-256', tone: 'source' } },
  ];
  const edge = (id: string, source: string, target: string, label: string): Edge => ({ id, source, target, label, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#3bc9c4' }, labelStyle: { fill: '#799097', fontSize: 9 } });
  const edges = [edge('e1', 'study', 'dose', 'defines'), edge('e2', 'study', 'finding', 'contains'), edge('e3', 'dose', 'animals', 'assigns'), edge('e4', 'finding', 'animals', 'observed in'), edge('e5', 'animals', 'lab', 'measured by'), edge('e6', 'animals', 'artifact', 'traces to'), edge('e7', 'lab', 'artifact', 'traces to')];
  return <div className="graph-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.45} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false}><Background color="#183039" gap={22} size={1} /><Controls showInteractive={false} /></ReactFlow></div>;
}
