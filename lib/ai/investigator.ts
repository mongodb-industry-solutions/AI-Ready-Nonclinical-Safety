import type { Citation, InvestigationResult, SemanticProfileId, SignalRecordEvidence, StudyEvidence } from '@/lib/contracts';
import { signalSummary } from '@/lib/analysis/signal-engine';
import { agentHealth } from '@/lib/ai/agent-health';

function canonicalCitations(recordEvidence?: SignalRecordEvidence): Citation[] {
  if (!recordEvidence?.available) return [];
  const findings = recordEvidence.subjects.flatMap((subject) => subject.findingRecords);
  const laboratory = recordEvidence.subjects.flatMap((subject) => subject.laboratoryRecords);
  const citations: Citation[] = [];
  if (findings[0]) citations.push({
    domain: 'MI',
    label: `${findings.length} canonical finding rows`,
    detail: `${recordEvidence.counts.subjects} animals · first row ${findings[0].lineage.recordHash}`,
    sourceRef: findings[0].sourceId,
  });
  if (laboratory[0]) citations.push({
    domain: 'LB',
    label: `${laboratory.length} related laboratory rows`,
    detail: `Checksum-verified source row · ${laboratory[0].lineage.recordHash}`,
    sourceRef: laboratory[0].sourceId,
  });
  if (recordEvidence.treatmentRecords[0]) citations.push({
    domain: 'TX',
    label: `${recordEvidence.treatmentRecords.length} treatment-definition rows`,
    detail: `Snapshot-bound trial-set evidence · package ${recordEvidence.packageId || 'not supplied'}`,
    sourceRef: recordEvidence.treatmentRecords[0].sourceId,
  });
  return citations;
}

export async function investigate(
  evidence: StudyEvidence,
  signalId: string,
  question: string,
  profileId: SemanticProfileId = 'toxicologist',
  recordEvidence?: SignalRecordEvidence,
): Promise<InvestigationResult> {
  const signal = evidence.signals.find((candidate) => candidate.id === signalId) || evidence.signals[0];
  const magentaUrl = process.env.INTERNAL_AGENT_URL?.replace(/\/$/, '');
  const sourceCitations = canonicalCitations(recordEvidence);
  // Recorded so the UI can state why the deterministic path answered, instead of
  // presenting a fallback as though the agent had run.
  let fallbackReason = (await agentHealth()).detail;

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
            profileId,
            canonicalEvidence: recordEvidence?.available ? {
              packageId: recordEvidence.packageId,
              modelSchemaVersion: recordEvidence.modelSchemaVersion,
              counts: recordEvidence.counts,
              sourceRecordIds: signal.sourceRecordIds || [],
            } : undefined,
          },
        }),
        cache: 'no-store',
      });
      if (response.ok) {
        const result = await response.json();
        return {
          answer: result.answer || 'The Magenta investigator completed without a textual response.',
          confidence: result.confidence || 'review',
          citations: Array.isArray(result.citations) && result.citations.length ? result.citations : sourceCitations,
          steps: Array.isArray(result.steps) ? result.steps : [],
          guardrails: result.guardrails || { readOnly: true, snapshotBound: true, regulatoryConclusion: false },
          provider: 'magenta',
        } as InvestigationResult;
      }
      fallbackReason = `The agent returned HTTP ${response.status}.`;
    } catch (error) {
      // The bundled deterministic investigator keeps the UI useful while the
      // internal Magenta service is starting or intentionally disabled.
      fallbackReason = error instanceof Error ? error.message : 'The agent request failed.';
    }
  }

  const structured = signalSummary(signal, evidence.doseGroups);
  const lab = signal.correlatedLab ? evidence.labSeries?.[signal.correlatedLab] : undefined;
  const day29 = lab?.points.find((point) => point.day === 29);
  const labContext = lab && day29
    ? ` At day 29, mean ${lab.label.toLowerCase()} are ${Number(day29['0']).toFixed(2)} ${lab.unit} in controls; treated-group means are ${evidence.doseGroups.filter((group) => group.dose > 0 && day29[String(group.dose)] != null).map((group) => `${group.dose}: ${Number(day29[String(group.dose)]).toFixed(2)}`).join(', ')}.`
    : '';

  return {
    answer: `${structured}${labContext} This is a review hypothesis, not a causal or regulatory conclusion.`,
    confidence: signal.reviewPriority === 'high' ? 'strong-pattern' : 'review',
    provider: 'deterministic',
    fallbackReason,
    citations: sourceCitations.length ? sourceCitations : [
      { domain: 'MI', label: `${signal.affectedAnimals} affected animals`, detail: signal.finding, sourceRef: `${evidence.study.snapshotId}:MI` },
      ...(lab ? [{ domain: 'LB', label: `${lab.label} trajectory`, detail: `Study days ${lab.points.map((p) => p.day).join(', ')}`, sourceRef: `${evidence.study.snapshotId}:LB:${signal.correlatedLab}` }] : []),
      { domain: 'TX', label: `${evidence.doseGroups.length} dose groups`, detail: evidence.doseGroups.map((group) => `${group.dose} ${group.unit}`).join(', '), sourceRef: `${evidence.study.snapshotId}:TX` },
    ],
    steps: [
      { id: 'scope', label: 'Bind immutable study scope', engine: 'structured', status: 'complete', detail: `${evidence.study.id} / ${evidence.study.snapshotId}` },
      { id: 'aggregate', label: 'Aggregate incidence and severity', engine: 'structured', status: 'complete', detail: 'Governed MI + DM + TX aggregation' },
      { id: 'retrieve', label: 'Retrieve semantic evidence', engine: 'vector', status: 'skipped', detail: sourceCitations.length ? 'The answer used exact canonical rows; the separate semantic-grounding request exposes its own hybrid execution trace' : 'Bundled fixture evidence used; vector retrieval requires a configured corpus' },
      { id: 'expand', label: 'Expand cross-domain graph', engine: 'graph', status: 'complete', detail: signal.correlatedLab ? `MI finding → animal → ${signal.correlatedLab} laboratory series` : 'MI finding → animal → treatment group' },
      { id: 'rerank', label: 'Rerank candidate evidence', engine: 'rerank', status: 'skipped', detail: 'No candidate set required reranking in the deterministic investigator path' },
      { id: 'synthesize', label: 'Compose cited review hypothesis', engine: 'synthesis', status: 'complete', detail: 'No autonomous mutation or regulatory conclusion' },
    ],
    guardrails: { readOnly: true, snapshotBound: true, regulatoryConclusion: false },
  };
}
