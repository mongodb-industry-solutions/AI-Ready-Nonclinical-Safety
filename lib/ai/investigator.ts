import type { BiologicalCoherenceResponse, Citation, InvestigationDeterministicContext, InvestigationResult, InvestigationWidget, InvestigationWidgetKind, LiteratureQueryResponse, PortfolioSimilarityResult, SemanticGroundingResult, SemanticProfileId, SignalRecordEvidence, StudyEvidence } from '@/lib/contracts';
import { signalSummary } from '@/lib/analysis/signal-engine';
import { agentHealth } from '@/lib/ai/agent-health';

function canonicalCitations(recordEvidence?: SignalRecordEvidence, coherence?: BiologicalCoherenceResponse): Citation[] {
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
  const organEndpoint = coherence?.targetOrgan.endpointSummaries.find((item) => item.sourceRecordIds.length);
  if (organEndpoint) citations.push({
    domain: organEndpoint.domain,
    label: `${coherence?.targetOrgan.endpointSummaries.length || 0} target-organ endpoint summaries`,
    detail: `${organEndpoint.test}${organEndpoint.phase ? ` · ${organEndpoint.phase}` : ''} · reconciled operational projection`,
    sourceRef: organEndpoint.sourceRecordIds[0],
  });
  const organSeries = coherence?.targetOrgan.measurementSeries.find((item) => item.sourceRecordIds.length);
  if (organSeries) citations.push({
    domain: organSeries.domain,
    label: `${coherence?.targetOrgan.measurementSeries.length || 0} target-organ measurement series`,
    detail: `${organSeries.test}${organSeries.unit ? ` · ${organSeries.unit}` : ''} · exact source membership`,
    sourceRef: organSeries.sourceRecordIds[0],
  });
  return citations;
}

type WidgetTemplate = Omit<InvestigationWidget, 'trigger'>;

export interface InvestigationInvocation {
  sessionId: string;
  turn: number;
  deterministicContext: InvestigationDeterministicContext;
}

function widgetCatalog(
  evidence: StudyEvidence,
  signalId: string,
  coherence?: BiologicalCoherenceResponse,
  semanticGrounding?: SemanticGroundingResult,
  literatureEvidence?: Omit<LiteratureQueryResponse, 'source' | 'plan'>,
  portfolioContext?: PortfolioSimilarityResult,
): WidgetTemplate[] {
  const signal = evidence.signals.find((candidate) => candidate.id === signalId) || evidence.signals[0];
  return [
    { id: 'dose-response', kind: 'dose-response', title: 'Dose-response evidence', sourceDomains: ['MI', 'DM', 'TX'] },
    ...(signal.correlatedLab && evidence.labSeries?.[signal.correlatedLab]
      ? [{ id: 'laboratory-trajectory', kind: 'laboratory-trajectory' as const, title: `${evidence.labSeries[signal.correlatedLab].label} trajectory`, sourceDomains: ['LB', 'DM', 'TX'] }]
      : []),
    ...(coherence?.available
      ? [{ id: 'biological-coherence', kind: 'biological-coherence' as const, title: 'Biological coherence', sourceDomains: ['MI', 'MA', 'OM', 'BW', 'BG', 'FW', 'LB', 'CL', 'EX', 'PC', 'PP', 'SE', 'DS', 'RELREC'] }]
      : []),
    ...(portfolioContext?.matches.length
      ? [{ id: 'portfolio-context', kind: 'portfolio-context' as const, title: 'Cross-study context', sourceDomains: ['MI', 'DM', 'TX', 'PORTFOLIO'] }]
      : []),
    ...(semanticGrounding
      ? [{ id: 'semantic-grounding', kind: 'semantic-grounding' as const, title: 'Semantic grounding', sourceDomains: ['SEMANTIC'] }]
      : []),
    ...(literatureEvidence?.documents.length
      ? [{ id: 'literature-evidence', kind: 'literature-evidence' as const, title: 'Literature evidence', sourceDomains: ['LITERATURE'] }]
      : []),
    { id: 'execution-plan', kind: 'execution-plan', title: 'Deterministic contract & executed plan', sourceDomains: ['MONGODB'] },
    { id: 'evidence-topology', kind: 'evidence-topology', title: 'Evidence topology', sourceDomains: ['DM', 'TX', 'MI', 'LB', 'RELREC'] },
  ];
}

function deterministicWidgetKinds(question: string, catalog: WidgetTemplate[]): InvestigationWidgetKind[] {
  const wording = question.toLowerCase();
  const candidates = new Set<InvestigationWidgetKind>();
  const add = (...kinds: InvestigationWidgetKind[]) => kinds.forEach((kind) => candidates.add(kind));
  if (/support|treatment|related|finding|incidence|severity|dose/.test(wording)) add('dose-response', 'laboratory-trajectory', 'biological-coherence');
  if (/support/.test(wording)) add('semantic-grounding', 'execution-plan', 'evidence-topology');
  if (/weight|food|clinical|patholog|organ|exposure|kinetic|coherence|laborator/.test(wording)) add('biological-coherence', 'laboratory-trajectory');
  if (/similar|portfolio|other stud|compar/.test(wording)) add('portfolio-context');
  if (/literature|pubmed|paper|publication|research/.test(wording)) add('literature-evidence');
  if (/semantic|meaning|term|taxonomy|value set|archetype/.test(wording)) add('semantic-grounding');
  if (/source|lineage|relationship|graph|link/.test(wording)) add('evidence-topology');
  if (/query|plan|execut|contract|how did|provenance|support/.test(wording)) add('execution-plan');
  if (!candidates.size) add('dose-response', 'biological-coherence');
  return catalog.map((item) => item.kind).filter((kind) => candidates.has(kind));
}

function hydrateWidgets(
  catalog: WidgetTemplate[],
  rawReceipts: unknown,
  scope: InvestigationDeterministicContext['boundScope'],
): InvestigationWidget[] {
  if (!Array.isArray(rawReceipts)) return [];
  const byKind = new Map(catalog.map((widget) => [widget.kind, widget]));
  const seen = new Set<InvestigationWidgetKind>();
  const widgets: InvestigationWidget[] = [];
  for (const raw of rawReceipts) {
    if (!raw || typeof raw !== 'object') continue;
    const receipt = raw as Record<string, unknown>;
    const kind = receipt.widgetKind as InvestigationWidgetKind;
    const receiptScope = receipt.scope as Record<string, unknown> | undefined;
    const template = byKind.get(kind);
    if (!template || seen.has(kind) || receipt.schemaVersion !== '1.0.0') continue;
    if (!receiptScope || Object.entries(scope).some(([key, value]) => receiptScope[key] !== value)) continue;
    seen.add(kind);
    widgets.push({
      ...template,
      trigger: {
        source: 'magenta-tool',
        toolName: 'present_evidence_widget',
        receiptSchemaVersion: '1.0.0',
        ...(typeof receipt.toolCallId === 'string' ? { toolCallId: receipt.toolCallId } : {}),
      },
    });
  }
  return widgets;
}

export async function investigate(
  evidence: StudyEvidence,
  signalId: string,
  question: string,
  profileId: SemanticProfileId = 'toxicologist',
  recordEvidence?: SignalRecordEvidence,
  coherence?: BiologicalCoherenceResponse,
  semanticGrounding?: SemanticGroundingResult,
  literatureEvidence?: Omit<LiteratureQueryResponse, 'source' | 'plan'>,
  portfolioContext?: PortfolioSimilarityResult,
  invocation?: InvestigationInvocation,
): Promise<InvestigationResult> {
  const signal = evidence.signals.find((candidate) => candidate.id === signalId) || evidence.signals[0];
  const magentaUrl = process.env.INTERNAL_AGENT_URL?.replace(/\/$/, '');
  const catalog = widgetCatalog(evidence, signalId, coherence, semanticGrounding, literatureEvidence, portfolioContext);
  const sessionId = invocation?.sessionId || 'unbound-deterministic-session';
  const turn = invocation?.turn || 1;
  const sourceCitations = [
    ...canonicalCitations(recordEvidence, coherence),
    ...(semanticGrounding?.hits.slice(0, 2).map((hit) => ({
      domain: 'SEMANTIC',
      label: hit.label,
      detail: `${hit.resourceType} · ${hit.lanes.join(' + ')} · score ${hit.score}`,
      sourceRef: hit.sourceRef,
    })) || []),
    ...(literatureEvidence?.documents.slice(0, 2).map((document) => ({
      domain: 'LITERATURE',
      label: document.title,
      detail: `${document.evidenceRole} · PMID ${document.pmid} · rank ${document.retrieval.rank}`,
      sourceRef: document.url,
    })) || []),
    ...(portfolioContext?.matches.slice(0, 2).map((match) => ({
      domain: 'PORTFOLIO',
      label: `${match.study.id} · ${match.signal.organ} ${match.signal.finding}`,
      detail: `${match.score}% contextual similarity · ${match.evidenceClass} · not pooled historical-control evidence`,
      sourceRef: match.id,
    })) || []),
  ];
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
          sessionId,
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
            biologicalCoherence: coherence?.available ? {
              organ: coherence.organ,
              endpointSummaryCount: coherence.inventory.endpointSummaries,
              measurementSeriesCount: coherence.inventory.measurementSeries,
              sourceDeclaredRelationshipCount: coherence.inventory.sourceDeclaredRelationships,
              laboratoryReferenceRangeCoverage: coherence.systemicContext.laboratoryCoverage,
              sourceRecordCitations: coherence.inventory.sourceRecordCitations,
              resolverId: coherence.execution.resolverId,
            } : undefined,
            semanticGrounding: semanticGrounding ? {
              mode: semanticGrounding.mode,
              releaseId: semanticGrounding.releaseId,
              hits: semanticGrounding.hits.slice(0, 8),
              stages: semanticGrounding.stages,
              managedEmbedding: semanticGrounding.managedEmbedding,
            } : undefined,
            literatureEvidence: literatureEvidence ? {
              execution: literatureEvidence.execution,
              documents: literatureEvidence.documents.slice(0, 8),
            } : undefined,
            portfolioContext: portfolioContext ? {
              execution: portfolioContext.execution,
              matches: portfolioContext.matches.slice(0, 5),
            } : undefined,
            deterministicContract: invocation?.deterministicContext,
          },
        }),
        cache: 'no-store',
      });
      if (response.ok) {
        const result = await response.json();
        const widgets = invocation
          ? hydrateWidgets(catalog, result.widgets, invocation.deterministicContext.boundScope)
          : [];
        return {
          answer: result.answer || 'The Magenta investigator completed without a textual response.',
          confidence: result.confidence || 'review',
          citations: Array.isArray(result.citations) && result.citations.length ? result.citations : sourceCitations,
          steps: Array.isArray(result.steps) ? result.steps : [],
          widgets,
          guardrails: result.guardrails || { readOnly: true, snapshotBound: true, regulatoryConclusion: false },
          provider: 'magenta',
          session: {
            id: result.sessionId || sessionId,
            turn,
            memory: 'magenta-checkpointer',
            scopeBound: true,
          },
          coherence,
          semanticGrounding,
          literatureEvidence,
          portfolioContext,
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
  const coherenceContext = coherence?.available
    ? ` The operational coherence resolver found ${coherence.inventory.endpointSummaries} target-organ endpoint summaries, ${coherence.targetOrgan.measurementSeries.length} target-organ measurement series, ${coherence.systemicContext.bodyWeightSeries.length} body-weight series, ${coherence.systemicContext.exposureSeries.length} exposure series, and ${coherence.inventory.sourceDeclaredRelationships} source-declared relationships. ${coherence.systemicContext.laboratoryCoverage.interpretation}`
    : '';
  const semanticContext = semanticGrounding?.hits.length
    ? ` Semantic grounding retrieved ${semanticGrounding.hits.length} profile-authorized meanings through ${semanticGrounding.mode}; the leading concepts are ${semanticGrounding.hits.slice(0, 3).map((hit) => hit.label).join(', ')}.`
    : ' No governed semantic candidate was retrieved for this wording.';
  const literatureContext = literatureEvidence?.documents.length
    ? ` ${literatureEvidence.documents.length} signal-bound literature artifacts were retrieved and reranked for contextual review.`
    : ' No literature artifact is currently bound to this exact signal, so literature is not used as supporting evidence.';
  const portfolioSummary = portfolioContext?.matches[0];
  const portfolioNarrative = portfolioSummary
    ? ` Cross-study retrieval found ${portfolioContext.matches.length} contextual comparators. The leading match is ${portfolioSummary.study.id}: ${portfolioSummary.signal.organ} ${portfolioSummary.signal.finding} (${portfolioSummary.score}% fused similarity); it is not pooled as a historical control.`
    : ' No authorized cross-study comparator was retrieved.';
  const semanticStageStatus = semanticGrounding?.hits.length
    ? (semanticGrounding.mode === 'atlas-hybrid' ? 'complete' : 'fallback')
    : 'skipped';
  const literatureStageStatus = literatureEvidence?.documents.length ? 'complete' : 'skipped';
  const widgets = deterministicWidgetKinds(question, catalog).map((kind) => ({
    ...catalog.find((widget) => widget.kind === kind)!,
    trigger: {
      source: 'deterministic-policy' as const,
      toolName: 'deterministic-widget-policy' as const,
      receiptSchemaVersion: '1.0.0' as const,
    },
  }));

  return {
    answer: `${structured}${labContext}${coherenceContext}${semanticContext}${literatureContext}${portfolioNarrative} These observations support expert review; they are not an automatic target-organ, causal, adversity, or regulatory conclusion.`,
    confidence: signal.reviewPriority === 'high' ? 'strong-pattern' : 'review',
    provider: 'deterministic',
    session: { id: sessionId, turn, memory: 'request-history', scopeBound: true },
    coherence,
    semanticGrounding,
    literatureEvidence,
    portfolioContext,
    fallbackReason,
    citations: sourceCitations.length ? sourceCitations : [
      { domain: 'MI', label: `${signal.affectedAnimals} affected animals`, detail: signal.finding, sourceRef: `${evidence.study.snapshotId}:MI` },
      ...(lab ? [{ domain: 'LB', label: `${lab.label} trajectory`, detail: `Study days ${lab.points.map((p) => p.day).join(', ')}`, sourceRef: `${evidence.study.snapshotId}:LB:${signal.correlatedLab}` }] : []),
      { domain: 'TX', label: `${evidence.doseGroups.length} dose groups`, detail: evidence.doseGroups.map((group) => `${group.dose} ${group.unit}`).join(', '), sourceRef: `${evidence.study.snapshotId}:TX` },
    ],
    widgets,
    steps: [
      { id: 'scope', label: 'Bind immutable study scope', engine: 'structured', status: 'complete', detail: `${evidence.study.id} / ${evidence.study.snapshotId}` },
      { id: 'aggregate', label: 'Aggregate incidence and severity', engine: 'structured', status: 'complete', detail: 'Governed MI + DM + TX endpoint summaries' },
      { id: 'coherence', label: 'Resolve biological coherence', engine: 'structured', status: coherence?.available ? 'complete' : 'fallback', detail: coherence?.available ? `${coherence.inventory.endpointSummaries} target-organ endpoints · ${coherence.inventory.measurementSeries} measurement series` : 'Operational evidence projections were not available' },
      { id: 'retrieve', label: 'Retrieve semantic evidence', engine: 'vector', status: semanticStageStatus, detail: semanticGrounding ? `${semanticGrounding.mode} · ${semanticGrounding.hits.length} profile-scoped meanings · ${semanticGrounding.managedEmbedding.vectorFieldInSourceDocument ? 'document vector' : 'Atlas-managed vector'}` : 'No authorized semantic retrieval was executed' },
      { id: 'expand', label: 'Expand cross-domain graph', engine: 'graph', status: 'complete', detail: coherence?.available ? `${coherence.inventory.sourceDeclaredRelationships} source-declared relationships kept distinct from governed joins` : signal.correlatedLab ? `MI finding → animal → ${signal.correlatedLab} laboratory series` : 'MI finding → animal → treatment group' },
      { id: 'compare', label: 'Retrieve cross-study context', engine: 'rerank', status: portfolioContext?.matches.length ? 'complete' : 'skipped', detail: portfolioContext?.matches.length ? `${portfolioContext.matches.length} contextual comparators · ${portfolioContext.execution.mode} · evidence boundaries retained` : 'No authorized comparator corpus was available' },
      { id: 'rerank', label: 'Rerank literature evidence', engine: 'rerank', status: literatureStageStatus, detail: literatureEvidence?.documents.length ? `${literatureEvidence.documents.length} governed documents · ${literatureEvidence.execution.mode} · reciprocal-rank fusion and domain reranking` : 'No signal-bound literature candidate was available to rerank' },
      { id: 'synthesize', label: 'Compose cited review hypothesis', engine: 'synthesis', status: 'complete', detail: 'No autonomous mutation or regulatory conclusion' },
    ],
    guardrails: { readOnly: true, snapshotBound: true, regulatoryConclusion: false },
  };
}
