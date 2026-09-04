'use client';

import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Box, Braces, Check, Database, GitBranch, Radio, RefreshCw, SearchCode, ShieldCheck } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { SemanticObject, SemanticRuntimeView } from '@/lib/contracts';

type Lens = 'business-documents' | 'semantic-graph' | 'retrieval-projections' | 'physical-mongodb';
type ModelNodeData = SemanticObject & { lens: Lens; updated: boolean; [key: string]: unknown };

function ModelNode({ data }: NodeProps<Node<ModelNodeData>>) {
  const meta = data.lens === 'physical-mongodb'
    ? `${data.collection} · ${data.documentPath}`
    : data.lens === 'retrieval-projections'
      ? data.retrieval.join(' + ')
      : data.lens === 'semantic-graph'
        ? `${data.kind} concept`
        : data.sourceDomains?.join(' + ') || data.kind;
  return <div className={`model-node model-${data.kind} ${data.updated ? 'model-updated' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <span>{data.kind}</span><strong>{data.label}</strong><small>{meta}</small>
    <Handle type="source" position={Position.Right} />
  </div>;
}

const nodeTypes = { model: ModelNode };
const lensIcons = { 'business-documents': Box, 'semantic-graph': GitBranch, 'retrieval-projections': SearchCode, 'physical-mongodb': Database };

export default function SemanticModelExplorer({ runtime, onRuntimeChange }: { runtime: SemanticRuntimeView; onRuntimeChange: (runtime: SemanticRuntimeView) => void }) {
  const [lens, setLens] = useState<Lens>('business-documents');
  const [selectedId, setSelectedId] = useState('Finding');
  const [streamState, setStreamState] = useState('connecting');
  const [changeStep, setChangeStep] = useState(-1);
  const [changeMode, setChangeMode] = useState('');
  const newValue = 'Lymphoid depletion, cortical';
  useEffect(() => {
    const stream = new EventSource(`/api/semantics/stream?profile=${runtime.activeProfile.id}`);
    const connected = () => setStreamState('synchronized');
    const changed = async () => {
      setStreamState('update received');
      const response = await fetch(`/api/semantics?profile=${runtime.activeProfile.id}`, { cache: 'no-store' });
      if (response.ok) onRuntimeChange(await response.json());
      setStreamState('map updated');
    };
    stream.addEventListener('semantic.snapshot.ready', connected);
    stream.addEventListener('semantic.release.activated', changed);
    stream.addEventListener('semantic.object.changed', changed);
    stream.addEventListener('profile.projection.changed', changed);
    stream.onerror = () => setStreamState('snapshot mode');
    return () => stream.close();
  }, [runtime.activeProfile.id, onRuntimeChange]);
  const selected = runtime.objects.find((object) => object.id === selectedId) || runtime.objects[0];
  const valueSet = runtime.valueSets.find((item) => item.id === 'finding-morphology');
  const demoValueActive = valueSet?.values.includes(newValue) || false;
  const relatedCapabilities = runtime.capabilities.filter((capability) => capability.reads.includes(selected?.id));
  const relatedResolvers = runtime.resolvers.filter((resolver) => relatedCapabilities.some((capability) => capability.id === resolver.capability));
  const nodes = useMemo<Array<Node<ModelNodeData>>>(() => runtime.objects.map((object) => ({
    id: object.id,
    type: 'model',
    position: object.position,
    data: { ...object, lens, updated: object.id === 'Finding' && changeStep === 4 },
  })), [runtime.objects, lens, changeStep]);
  const edges = useMemo<Array<Edge>>(() => {
    const visible = new Set(runtime.objects.map((object) => object.id));
    return runtime.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: lens === 'semantic-graph' ? edge.predicate : edge.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: edge.to === selectedId ? '#65e3dc' : '#31545c', strokeWidth: edge.to === selectedId ? 2 : 1.1 },
    labelStyle: { fill: '#6f8a92', fontSize: 8 },
    }));
  }, [runtime.objects, runtime.edges, lens, selectedId]);

  async function demonstrateSemanticChange() {
    setSelectedId('Finding');
    setLens('semantic-graph');
    setChangeStep(0);
    try {
      const response = await fetch('/api/semantics/value-sets/observe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ valueSetId: 'finding-morphology', value: newValue, source: 'incoming SEND MI record', profile: runtime.activeProfile.id }) });
      const payload = await response.json();
      setChangeMode(payload.mode || 'portable-simulation');
      for (let step = 1; step <= 4; step += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        setChangeStep(step);
      }
      if (payload.runtime) onRuntimeChange(payload.runtime);
      setStreamState('map updated');
    } catch {
      setChangeMode('portable-simulation');
      setChangeStep(4);
    }
  }

  return <section className="model-explorer">
    <header className="model-hero">
      <div><span className="panel-kicker">Compiled by Context Studio · portable runtime {runtime.release.version}</span><h1>The model is part of the product</h1><p>Explore the same governed meaning through business documents, semantic relationships, retrieval projections, and the deployed MongoDB shape.</p></div>
      <div className="release-live"><Radio size={14} /><span><b>LIVE SEMANTICS · {streamState}</b><small>{runtime.release.releaseId}</small></span></div>
    </header>
    <div className="profile-banner"><ShieldCheck size={15} /><span><b>{runtime.activeProfile.label} projection</b>{runtime.activeProfile.description}</span><em>{runtime.objects.length} visible objects · {runtime.capabilities.length} agent capabilities · {runtime.actions.length} governed actions</em></div>
    <section className="semantic-change-lab">
      <div className="change-summary"><span className="panel-kicker">Semantic change lab</span><h2>Watch a new source value become governed meaning</h2><p><b>{newValue}</b> appears in a new MI record. The evidence stays immutable while the terminology projection is reviewed and refreshed.</p></div>
      <div className="change-flow">{['Value observed', 'Change Stream', 'Validate candidate', 'Compile projection', 'Map refreshed'].map((label, index) => <div key={label} className={changeStep >= index ? 'complete' : changeStep === index - 1 ? 'next' : ''}><i>{changeStep > index ? <Check size={10} /> : index + 1}</i><span>{label}</span></div>)}</div>
      <div className="change-action"><span><b>{valueSet?.label}</b><small>{(valueSet?.values.length || 0) + (changeStep === 4 && !demoValueActive ? 1 : 0)} values · {changeMode || 'ready'}</small></span><button onClick={demonstrateSemanticChange} disabled={changeStep >= 0 && changeStep < 4}><RefreshCw size={13} className={changeStep >= 0 && changeStep < 4 ? 'spin' : ''} /> {changeStep === 4 ? 'Replay update' : changeStep >= 0 ? 'Compiling…' : 'Simulate new value'}</button></div>
    </section>
    <nav className="model-lenses">{runtime.surfaces.map((surface) => { const Icon = lensIcons[surface.id as Lens] || Braces; return <button key={surface.id} className={lens === surface.id ? 'active' : ''} onClick={() => setLens(surface.id as Lens)}><Icon size={15} /><span><b>{surface.label}</b><small>{surface.description}</small></span></button>; })}</nav>
    <div className="model-workbench">
      <div className="model-canvas">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .16 }} minZoom={.42} maxZoom={1.6} nodesConnectable={false} onNodeClick={(_, node) => setSelectedId(node.id)}>
          <Background color="#183039" gap={24} size={1} /><MiniMap nodeColor={(node) => node.id === selectedId ? '#eabd5b' : '#2f7477'} maskColor="rgba(5,13,17,.76)" /><Controls showInteractive={false} />
        </ReactFlow>
        <div className="model-canvas-caption"><span>{runtime.edges.length} governed relationships</span><span>{runtime.subscriptions[0]?.source} · resumable</span></div>
      </div>
      {selected && <aside className="model-inspector">
        <div className="inspector-type">{selected.kind} object</div><h2>{selected.label}</h2><p>{selected.description}</p>
        <div className="inspector-block"><span>DOCUMENT BINDING</span><code>{selected.collection}.{selected.documentPath}</code></div>
        <div className="inspector-block"><span>STANDARD SOURCE</span><div className="tag-row">{(selected.sourceDomains || ['solution']).map((item) => <i key={item}>{item}</i>)}</div></div>
        <div className="inspector-block"><span>RETRIEVAL PROJECTIONS</span><div className="tag-row">{selected.retrieval.map((item) => <i key={item}>{item}</i>)}</div></div>
        <div className="inspector-block"><span>AUTHORIZED RESOLVERS</span>{relatedResolvers.length ? relatedResolvers.map((resolver) => <div className="resolver-card" key={resolver.id}><b>{resolver.id}</b><small>{resolver.executor}</small><em>{resolver.stages.join(' → ')}</em></div>) : <small>No direct resolver in this profile.</small>}</div>
      </aside>}
    </div>
  </section>;
}
