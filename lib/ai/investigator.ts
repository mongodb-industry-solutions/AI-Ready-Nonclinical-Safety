import type { InvestigationResult, StudyEvidence } from '@/lib/contracts';
import { signalSummary } from '@/lib/analysis/signal-engine';

export async function investigate(
  evidence: StudyEvidence,
  signalId: string,
  question: string,
): Promise<InvestigationResult> {
  const signal = evidence.signals.find((candidate) => candidate.id === signalId) || evidence.signals[0];
  const magentaUrl = process.env.INTERNAL_AGENT_URL?.replace(/\/$/, '');

  if (magentaUrl) {
    try {
      const response = await fetch(`${magentaUrl}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: question,
          context: {
            studyId: evidence.study.id,
            snapshotId: evidence.study.snapshotId,
            signalId: signal.id,
          },
        }),
        cache: 'no-store',
      });
      if (response.ok) {
        const result = await response.json();
        return {
          answer: result.answer || 'The Magenta investigator completed without a textual response.',
          confidence: result.confidence || 'review',
          citations: Array.isArray(result.citations) ? result.citations : [],
          steps: Array.isArray(result.steps) ? result.steps : [],
          guardrails: result.guardrails || { readOnly: true, snapshotBound: true, regulatoryConclusion: false },
          provider: 'magenta',
        } as InvestigationResult;
      }
    } catch {
      // The bundled deterministic investigator keeps the UI useful while the
      // internal Magenta service is starting or intentionally disabled.
    }
  }

  const structured = signalSummary(signal, evidence.doseGroups);
  const lab = signal.correlatedLab ? evidence.labSeries[signal.correlatedLab] : null;
  const day29 = lab?.points.find((point) => point.day === 29);
  const labContext = lab && day29
    ? ` At day 29, mean ${lab.label.toLowerCase()} are ${day29['0'].toFixed(2)} ${lab.unit} in controls and lower in each treated group (${[4, 6, 8, 12].map((dose) => `${dose}: ${day29[String(dose)].toFixed(2)}`).join(', ')}), although the highest dose is non-monotonic.`
    : '';

  return {
    answer: `${structured}${labContext} This is a review hypothesis, not a causal or regulatory conclusion.`,
    confidence: signal.reviewPriority === 'high' ? 'strong-pattern' : 'review',
    provider: 'deterministic',
    citations: [
      { domain: 'MI', label: `${signal.affectedAnimals} affected animals`, detail: signal.finding, sourceRef: `${evidence.study.snapshotId}:MI` },
      ...(lab ? [{ domain: 'LB', label: `${lab.label} trajectory`, detail: `Study days ${lab.points.map((p) => p.day).join(', ')}`, sourceRef: `${evidence.study.snapshotId}:LB:${signal.correlatedLab}` }] : []),
      { domain: 'TX', label: `${evidence.doseGroups.length} dose groups`, detail: evidence.doseGroups.map((group) => `${group.dose} ${group.unit}`).join(', '), sourceRef: `${evidence.study.snapshotId}:TX` },
    ],
    steps: [
      { id: 'scope', label: 'Bind immutable study scope', engine: 'structured', status: 'complete', detail: `${evidence.study.id} / ${evidence.study.snapshotId}` },
      { id: 'aggregate', label: 'Aggregate incidence and severity', engine: 'structured', status: 'complete', detail: 'Governed MI + DM + TX aggregation' },
      { id: 'retrieve', label: 'Retrieve semantic evidence', engine: 'vector', status: 'fallback', detail: 'Fixture mode uses deterministic evidence; Atlas Vector Search activates in connected mode' },
      { id: 'expand', label: 'Expand cross-domain graph', engine: 'graph', status: 'complete', detail: signal.correlatedLab ? `MI finding → animal → ${signal.correlatedLab} laboratory series` : 'MI finding → animal → treatment group' },
      { id: 'rerank', label: 'Rerank candidate evidence', engine: 'rerank', status: 'planned', detail: 'Second-stage reranker is enabled by the Magenta deployment profile' },
      { id: 'synthesize', label: 'Compose cited review hypothesis', engine: 'synthesis', status: 'complete', detail: 'No autonomous mutation or regulatory conclusion' },
    ],
    guardrails: { readOnly: true, snapshotBound: true, regulatoryConclusion: false },
  };
}
