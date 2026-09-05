'use client';

import { useState } from 'react';
import { Bot, ChevronRight, Send, ShieldCheck, Sparkles } from 'lucide-react';
import type { InvestigationResult, SafetySignal, SemanticProfileId, StudySummary } from '@/lib/contracts';

const prompts = [
  'Is this finding plausibly treatment-related?',
  'Compare incidence and severity across doses.',
  'Show the cross-domain evidence and its lineage.',
];

export default function AgentPanel({ study, signal, profileId = 'toxicologist', enabled = true, id }: { study: StudySummary; signal: SafetySignal; profileId?: SemanticProfileId; enabled?: boolean; id?: string }) {
  const [question, setQuestion] = useState(prompts[0]);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(nextQuestion = question) {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    setQuestion(nextQuestion);
    try {
      const response = await fetch('/api/investigations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studyId: study.id, signalId: signal.id, profileId, question: nextQuestion }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The investigation could not be authorized');
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The investigation could not be authorized');
    } finally { setBusy(false); }
  }

  return <aside className="agent-panel" id={id}>
    <div className="agent-heading"><span className="agent-orb"><Sparkles size={17} /></span><div><strong>AI Safety Investigator</strong><small><ShieldCheck size={11} /> Read-only · snapshot-bound</small></div><span className="agent-live">LIVE</span></div>
    <div className="agent-scope"><span>STUDY</span><b>{study.id}</b><span>SNAPSHOT</span><b>{study.snapshotId}</b></div>
    <div className="agent-conversation">
      <div className="chat-user">{question}</div>
      <div className="chat-agent">
        <div className="chat-agent-label"><Bot size={13} /> Investigation</div>
        {!enabled ? <p>This semantic profile is not authorized to run the AI evidence investigator.</p> : error ? <p>{error}</p> : busy ? <div className="thinking"><i /><i /><i /> Planning governed retrieval…</div> : result ? <>
          <p>{result.answer}</p>
          <div className="agent-citations">{result.citations.map((citation) => <button key={citation.sourceRef} title={citation.detail}>{citation.domain} · {citation.label}</button>)}</div>
        </> : <p>Select a suggested investigation or ask your own question. I will combine exact study queries, semantic evidence, graph expansion and citations.</p>}
      </div>
      {result && <div className="agent-plan"><div className="agent-plan-title">What I checked <span>{result.provider}</span></div>{result.steps.map((step) => <div className="agent-step" key={step.id}><span className={`step-dot ${step.status}`} /><div><b>{step.label}</b><small>{step.detail}</small></div></div>)}</div>}
    </div>
    <div className="agent-prompts">{prompts.map((prompt) => <button key={prompt} disabled={!enabled} onClick={() => ask(prompt)}>{prompt}<ChevronRight size={12} /></button>)}</div>
    <form className="agent-input" onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask(); }}><input disabled={!enabled} value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Ask the safety investigator" placeholder="Ask about dose, findings, labs, or lineage…" /><button disabled={busy || !enabled} aria-label="Send question"><Send size={15} /></button></form>
  </aside>;
}
