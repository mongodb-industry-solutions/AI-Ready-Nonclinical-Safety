'use client';

import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Box, Braces, Check, Database, GitBranch, Radio, RefreshCw, Search, SearchCode, ShieldCheck, Sparkles } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { SemanticObject, SemanticRuntimeView } from '@/lib/contracts';

type Lens = 'business-documents' | 'semantic-graph' | 'retrieval-projections' | 'physical-mongodb';
type ModelNodeData = SemanticObject & { lens: Lens; updated: boolean; meta: string; [key: string]: unknown };
type SemanticSearchResult = {
  mode: string;
  releaseId: string;
  profileId: string;
  hits: Array<{ resourceType: string; resourceId: string; label: string; excerpt: string; score: number; lanes: string[]; sourceRef: string }>;
  stages: Array<{ id: string; status: string; detail: string }>;
  managedEmbedding: { index: string; sourcePath: string; vectorStorage: string; vectorFieldInSourceDocument: false };
};

const initialSemanticQuery = 'Which concepts, archetypes and resolvers govern a thymus lymphocyte finding?';

function ModelNode({ data }: NodeProps<Node<ModelNodeData>>) {
  return <div className={`model-node model-${data.kind} ${data.updated ? 'model-updated' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <span>{data.kind}</span><strong>{data.label}</strong><small>{data.meta}</small>
    <Handle type="source" position={Position.Right} />
  </div>;
}

const nodeTypes = { model: ModelNode };
const lensIcons = { 'business-documents': Box, 'semantic-graph': GitBranch, 'retrieval-projections': SearchCode, 'physical-mongodb': Database };

export default function SemanticModelExplorer({ runtime, focusId, onRuntimeChange }: { runtime: SemanticRuntimeView; focusId?: string; onRuntimeChange: (runtime: SemanticRuntimeView) => void }) {
  const [lens, setLens] = useState<Lens>('business-documents');
  const [selectedId, setSelectedId] = useState('Finding');
  const [streamState, setStreamState] = useState('connecting');
  const [changeStep, setChangeStep] = useState(-1);
  const [changeMode, setChangeMode] = useState('');
  const [semanticQuery, setSemanticQuery] = useState(initialSemanticQuery);
  const [semanticSearch, setSemanticSearch] = useState<SemanticSearchResult | null>(null);
  const [semanticSearchState, setSemanticSearchState] = useState<'loading' | 'ready' | 'error'>('loading');
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
  useEffect(() => {
    let active = true;
    setSemanticSearchState('loading');
    fetch(`/api/semantics/search?profile=${runtime.activeProfile.id}&q=${encodeURIComponent(initialSemanticQuery)}&limit=6`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Semantic retrieval failed');
        return response.json() as Promise<SemanticSearchResult>;
      })
      .then((payload) => { if (active) { setSemanticSearch(payload); setSemanticSearchState('ready'); } })
      .catch(() => { if (active) setSemanticSearchState('error'); });
    return () => { active = false; };
  }, [runtime.activeProfile.id, runtime.release.releaseId]);
  useEffect(() => {
    if (focusId && runtime.objects.some((object) => object.id === focusId)) {
      setSelectedId(focusId);
      setLens('semantic-graph');
    }
  }, [focusId, runtime.objects]);
  const selected = runtime.objects.find((object) => object.id === selectedId) || runtime.objects[0];
  const valueSet = runtime.valueSets.find((item) => item.id === 'finding-morphology');
  const demoValueActive = valueSet?.values.includes(newValue) || false;
  const relatedCapabilities = runtime.capabilities.filter((capability) => capability.reads.includes(selected?.id));
  const relatedResolvers = runtime.resolvers.filter((resolver) => relatedCapabilities.some((capability) => capability.id === resolver.capability));
  const selectedConcepts = runtime.taxonomy.concepts.filter((concept) => concept.semanticObjects.includes(selected?.id));
  const selectedArchetypes = runtime.archetypes.filter((archetype) => archetype.members.some((member) => member.semanticObject === selected?.id));
  const selectedStorage = runtime.storageBindings.filter((binding) => binding.semanticObject === selected?.id);
  const nodes = useMemo<Array<Node<ModelNodeData>>>(() => runtime.objects.map((object) => ({
    id: object.id,
    type: 'model',
    position: object.position,
    data: {
      ...object,
      lens,
      updated: object.id === 'Finding' && changeStep === 4,
      meta: lens === 'physical-mongodb'
        ? runtime.storageBindings.filter((binding) => binding.semanticObject === object.id).map((binding) => `${binding.adapter}:${binding.location}`).join(' + ') || 'unbound'
        : lens === 'retrieval-projections'
          ? object.retrieval.join(' + ')
          : lens === 'semantic-graph'
            ? runtime.taxonomy.concepts.filter((concept) => concept.semanticObjects.includes(object.id)).map((concept) => concept.label).join(' · ') || `${object.kind} concept`
            : runtime.archetypes.filter((archetype) => archetype.members.some((member) => member.semanticObject === object.id)).map((archetype) => archetype.label).join(' · ') || object.kind,
    },
  })), [runtime.objects, runtime.storageBindings, runtime.taxonomy.concepts, runtime.archetypes, lens, changeStep]);
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

  async function runSemanticSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (semanticQuery.trim().length < 2) return;
    setSemanticSearchState('loading');
    try {
      const response = await fetch(`/api/semantics/search?profile=${runtime.activeProfile.id}&q=${encodeURIComponent(semanticQuery)}&limit=6`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Semantic retrieval failed');
      setSemanticSearch(await response.json());
      setSemanticSearchState('ready');
    } catch {
      setSemanticSearchState('error');
    }
  }

  return <section className="model-explorer">
    <header className="model-hero">
      <div><span className="panel-kicker">Compiled by Context Studio · portable runtime {runtime.release.version}</span><h1>Meaning is portable. Placement is explicit.</h1><p>Explore taxonomy and terminology, archetype composition, retrieval projections, and every physical representation without confusing storage with semantics.</p></div>
      <div className="release-live"><Radio size={14} /><span><b>LIVE SEMANTICS · {streamState}</b><small>{runtime.release.releaseId}</small></span></div>
    </header>
    <div className="profile-banner"><ShieldCheck size={15} /><span><b>{runtime.activeProfile.label} projection</b>{runtime.activeProfile.description}</span><em>{runtime.objects.length} visible objects · {runtime.capabilities.length} agent capabilities · {runtime.actions.length} governed actions</em></div>
    <section className="semantic-search-lab">
      <div className="semantic-search-intro"><span className="panel-kicker">Semantic retrieval fabric</span><h2>Ask the map, not only the evidence.</h2><p>Profile-scoped lexical and vector retrieval over concepts, archetypes, resolvers, storage bindings and graph edges.</p></div>
      <div className="semantic-search-console">
        <form onSubmit={runSemanticSearch}><Search size={14} /><input value={semanticQuery} onChange={(event) => setSemanticQuery(event.target.value)} aria-label="Search the semantic map" /><button type="submit" disabled={semanticSearchState === 'loading'}>{semanticSearchState === 'loading' ? 'Resolving…' : 'Resolve'}</button></form>
        <div className="semantic-search-pipeline"><span><SearchCode size={11} /> lexical</span><i>+</i><span className="managed-vector"><Sparkles size={11} /> Atlas autoEmbed</span><i>→</i><span>RRF</span><i>→</i><span>{runtime.activeProfile.id}</span></div>
        <small className="managed-vector-proof">Source documents contain semantic text and provenance. Atlas stores managed vectors in <code>__mdb_internal_search</code>; no vector field is written to the map.</small>
      </div>
      <div className="semantic-search-results">
        <header><span>{semanticSearch?.mode || semanticSearchState}</span><b>{semanticSearch?.hits.length || 0} governed matches</b></header>
        {semanticSearch?.hits.slice(0, 4).map((hit) => <button key={`${hit.resourceType}:${hit.resourceId}`} onClick={() => { if (runtime.objects.some((object) => object.id === hit.resourceId)) setSelectedId(hit.resourceId); setLens('retrieval-projections'); }}><em>{hit.resourceType}</em><span><b>{hit.label}</b><small>{hit.lanes.join(' + ')} · score {hit.score}</small></span></button>)}
        {semanticSearchState === 'error' && <p>Semantic search is unavailable; the signed map remains browsable.</p>}
      </div>
    </section>
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
        {lens === 'business-documents' && <div className="inspector-block"><span>ARCHETYPE COMPOSITION</span>{selectedArchetypes.map((archetype) => { const member = archetype.members.find((item) => item.semanticObject === selected.id); return <div className="resolver-card" key={archetype.id}><b>{archetype.label}</b><small>{member?.role} · {member?.cardinality}</small><em>{archetype.extends ? `extends ${archetype.extends}` : 'root archetype'}</em></div>; })}</div>}
        {lens === 'semantic-graph' && <div className="inspector-block"><span>CONCEPTS &amp; TERMINOLOGY</span>{selectedConcepts.map((concept) => <div className="resolver-card" key={concept.id}><b>{concept.label}</b><small>{concept.kind}{concept.broader ? ` · broader: ${concept.broader}` : ''}</small><em>{[...(concept.externalMappings || []), ...(concept.valueSet ? [`value set: ${concept.valueSet}`] : [])].join(' · ')}</em></div>)}</div>}
        {lens === 'physical-mongodb' && <div className="inspector-block"><span>PHYSICAL PLACEMENTS</span>{selectedStorage.map((binding) => <div className="resolver-card" key={binding.id}><b>{binding.adapter} · {binding.location}</b><small>{binding.representation} · {binding.authority}</small><em>{binding.path}</em></div>)}</div>}
        {lens === 'retrieval-projections' && <div className="inspector-block"><span>RETRIEVAL PROJECTIONS</span><div className="tag-row">{selected.retrieval.map((item) => <i key={item}>{item}</i>)}</div><div className="autoembed-contract"><Sparkles size={13} /><span><b>Atlas-managed semantic embedding</b><small><code>semantic_search_documents.text</code> → <code>{semanticSearch?.managedEmbedding.index || 'semantic_map_auto_embed'}</code></small><em>Vector stored internally; source document stays readable.</em></span></div></div>}
        <div className="inspector-block"><span>STANDARD SOURCE</span><div className="tag-row">{(selected.sourceDomains || ['solution']).map((item) => <i key={item}>{item}</i>)}</div></div>
        <div className="inspector-block"><span>AUTHORIZED RESOLVERS</span>{relatedResolvers.length ? relatedResolvers.map((resolver) => <div className="resolver-card" key={resolver.id}><b>{resolver.id}</b><small>{resolver.executor}</small><em>{resolver.stages.join(' → ')}</em></div>) : <small>No direct resolver in this profile.</small>}</div>
      </aside>}
    </div>
  </section>;
}
