'use client';

import { useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SafetySignal, StudyEvidence } from '@/lib/contracts';

type EvidenceNodeData = { label: string; meta: string; detail: string; tone: 'study' | 'finding' | 'animal' | 'lab' | 'source' | 'dose' };

function EvidenceNode({ data }: NodeProps<Node<EvidenceNodeData>>) {
  return <div className={`evidence-node tone-${data.tone}`}><Handle type="target" position={Position.Left} /><strong>{data.label}</strong><span>{data.meta}</span><Handle type="source" position={Position.Right} /></div>;
}

const nodeTypes = { evidence: EvidenceNode };

export default function EvidenceGraph({ evidence, signal, immersive = false }: { evidence: StudyEvidence; signal: SafetySignal; immersive?: boolean }) {
  const [selectedNode, setSelectedNode] = useState<string>('finding');
  const nodes = useMemo<Array<Node<EvidenceNodeData>>>(() => {
    const doseNodes = evidence.doseGroups.map((group, index) => {
      const affected = signal.incidence[index] || 0;
      return {
        id: `dose-${group.code}`,
        type: 'evidence',
        position: { x: 245, y: index * 92 },
        data: {
          label: group.dose === 0 ? 'Vehicle control' : `${group.dose} ${group.unit}`,
          meta: `${affected}/${group.animalCount} affected · TX`,
          detail: `${group.label}: ${affected} of ${group.animalCount} animals contribute to the selected incidence pattern.`,
          tone: 'dose' as const,
        },
      };
    });
    return [
      { id: 'study', type: 'evidence', position: { x: 0, y: 184 }, data: { label: evidence.study.id, meta: `${evidence.study.profile} · ${evidence.study.snapshotId}`, detail: `${evidence.study.recordCount.toLocaleString()} governed records across ${evidence.study.domains.join(', ')}.`, tone: 'study' } },
      ...doseNodes,
      { id: 'finding', type: 'evidence', position: { x: 505, y: 184 }, data: { label: signal.organ, meta: `${signal.affectedAnimals}/${signal.totalAnimals} · ${signal.pattern}`, detail: signal.finding, tone: 'finding' } },
      { id: 'animals', type: 'evidence', position: { x: 760, y: 102 }, data: { label: 'Supporting subjects', meta: `${signal.affectedAnimals} animals · DM + MI`, detail: 'Subject identity, treatment assignment, finding and severity remain joined by governed identifiers.', tone: 'animal' } },
      { id: 'lab', type: 'evidence', position: { x: 760, y: 270 }, data: { label: signal.correlatedLab || 'Context evidence', meta: signal.correlatedLab ? 'Longitudinal laboratory series · LB' : 'No direct laboratory correlate', detail: signal.correlatedLab ? `${evidence.labSeries?.[signal.correlatedLab]?.label || signal.correlatedLab} measurements provide temporal biological context.` : 'The signal remains connected to treatment and subject records without asserting a laboratory correlate.', tone: 'lab' } },
      { id: 'artifact', type: 'evidence', position: { x: 1015, y: 184 }, data: { label: 'Source evidence', meta: 'XPT + Define-XML + SHA-256', detail: 'Every derived assertion can be traced to immutable, checksum-verified source artifacts.', tone: 'source' } },
    ];
  }, [evidence, signal]);
  const edge = (id: string, source: string, target: string, label: string, highlighted = false): Edge => ({ id, source, target, label, animated: highlighted, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: highlighted ? '#64e8df' : '#2b666b', strokeWidth: highlighted ? 1.8 : 1.1 }, labelStyle: { fill: '#78939b', fontSize: 9 } });
  const edges = useMemo(() => [
    ...evidence.doseGroups.map((group, index) => edge(`study-dose-${group.code}`, 'study', `dose-${group.code}`, index === 0 ? 'assigns' : '', false)),
    ...evidence.doseGroups.map((group) => edge(`dose-finding-${group.code}`, `dose-${group.code}`, 'finding', 'incidence', true)),
    edge('finding-animals', 'finding', 'animals', 'observed in', true),
    edge('finding-lab', 'finding', 'lab', 'correlates', Boolean(signal.correlatedLab)),
    edge('animals-artifact', 'animals', 'artifact', 'traces to'),
    edge('lab-artifact', 'lab', 'artifact', 'traces to'),
  ], [evidence.doseGroups, signal.correlatedLab]);
  const selected = nodes.find((node) => node.id === selectedNode)?.data || nodes[0].data;

  return <div className={`graph-canvas ${immersive ? 'immersive' : ''}`}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.16 }} minZoom={0.38} maxZoom={1.55} nodesDraggable={immersive} nodesConnectable={false} elementsSelectable onNodeClick={(_, node) => setSelectedNode(node.id)}>
      <Background color="#183039" gap={22} size={1} />
      <MiniMap pannable zoomable nodeColor={(node) => node.id === 'finding' ? '#eabd5b' : node.id === selectedNode ? '#57ddd8' : '#27454d'} maskColor="rgba(5, 13, 17, .78)" style={{ width: 150, height: 92 }} />
      <Controls showInteractive={false} />
    </ReactFlow>
    <div className="graph-inspector" aria-live="polite"><span>Selected evidence</span><b>{selected.label}</b><p>{selected.detail}</p></div>
    <div className="graph-legend"><span><i className="legend-flow" /> Evidence flow</span><span><i className="legend-source" /> Governed source</span><span><i className="legend-ai" /> AI retrieval path</span></div>
  </div>;
}
