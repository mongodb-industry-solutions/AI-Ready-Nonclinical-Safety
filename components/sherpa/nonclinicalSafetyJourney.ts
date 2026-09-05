export const NONCLINICAL_SAFETY_JOURNEY_ID = 'nonclinical-safety-guided-demo-v1';
export const NONCLINICAL_SAFETY_SEED_VERSION = 2;

export const NONCLINICAL_SAFETY_DEMO_CONTEXT = {
  projectSlug: 'mongodb-industry-solutions',
  projectName: 'MongoDB Industry Solutions',
  demoSlug: 'ai-ready-nonclinical-safety',
  demoName: 'AI-Ready Nonclinical Safety',
  demoDescription: 'A governed journey from standardized SEND study evidence to an explainable, human-owned safety hypothesis.',
};

type ReplayCondition = {
  type: 'none' | 'element-visible' | 'element-hidden' | 'url-is' | 'url-includes' | 'text-visible';
  selector: string;
  text: string;
  url: string;
  timeoutMs: number;
};

type JourneyAction = {
  actionId: string;
  selector: string;
  expectedState: string;
  atMs?: number;
};

type NarrationPart = {
  text: string;
  pauseMs?: number;
  checkpointState?: string;
};

const noCondition = (): ReplayCondition => ({
  type: 'none',
  selector: '',
  text: '',
  url: '',
  timeoutMs: 4000,
});

const visibleState = (state: string): ReplayCondition => ({
  type: 'element-visible',
  selector: `[data-sherpa-state="${state}"]`,
  text: '',
  url: '',
  timeoutMs: 5000,
});

function buildNarrationSegments(stepId: string, parts: NarrationPart[]) {
  let cursorMs = 0;
  let ordinal = 0;
  const segments: Array<Record<string, unknown>> = [];

  parts.forEach((part, partIndex) => {
    const durationMs = Math.max(3000, part.text.trim().split(/\s+/).length * 390);
    segments.push({
      id: `${stepId}-speech-${partIndex + 1}`,
      type: 'speech',
      ordinal: ordinal++,
      source_language: 'English',
      source_text: part.text,
      source_start_ms: cursorMs,
      source_end_ms: cursorMs + durationMs,
      target_duration_ms: durationMs,
      pause_after_ms: 0,
      checkpoint_key: part.checkpointState ? `${stepId}-${part.checkpointState}` : '',
      checkpoint_condition: part.checkpointState ? visibleState(part.checkpointState) : noCondition(),
      review_status: 'draft',
      translations: {},
    });
    cursorMs += durationMs;

    if (part.pauseMs) {
      segments.push({
        id: `${stepId}-pause-${partIndex + 1}`,
        type: 'silence',
        ordinal: ordinal++,
        start_ms: cursorMs,
        end_ms: cursorMs + part.pauseMs,
        duration_ms: part.pauseMs,
      });
      cursorMs += part.pauseMs;
    }
  });

  return { segments, durationMs: cursorMs };
}

function buildReplayEvents(stepId: string, actions: JourneyAction[]) {
  return actions.map((action, index) => ({
    id: `${stepId}-event-${index + 1}`,
    type: 'click',
    actionId: action.actionId,
    selector: action.selector,
    capturedAtMs: action.atMs ?? index * 800,
    critical: true,
    failureBehavior: 'pause',
    label: action.actionId,
    postCondition: visibleState(action.expectedState),
    preCondition: noCondition(),
  }));
}

function buildStep({
  id,
  name,
  title,
  outline,
  whyMongo,
  narration,
  actions,
}: {
  id: string;
  name: string;
  title: string;
  outline: string;
  whyMongo: string;
  narration: NarrationPart[];
  actions: JourneyAction[];
}) {
  const { segments, durationMs } = buildNarrationSegments(id, narration);
  return {
    id,
    name,
    overviewTitle: title,
    overviewNarrationHtml: `<p>${narration.map((part) => part.text).join(' ')}</p>`,
    overviewStepOutlineHtml: `<p>${outline}</p>`,
    overviewWhyMongoHtml: `<p>${whyMongo}</p>`,
    overviewSections: [],
    beforeMessage: '',
    preconditions: [{
      id: `${id}-app-ready`,
      description: 'The Safety Intelligence application is ready.',
      condition: visibleState('app-ready'),
    }],
    timingMarkers: segments.map((segment) => ({
      id: `${segment.id}-marker`,
      type: segment.type === 'silence' ? 'pause' : 'segment-start',
      atMs: segment.type === 'silence' ? segment.start_ms : segment.source_start_ms,
      checkpointKey: segment.checkpoint_key || '',
    })),
    narrationSegments: segments,
    talkTrack: narration.map((part) => part.text).join(' '),
    // This demo is one single-page workspace, so playback should drive its
    // controls without reloading the route before every step.
    path: '',
    primaryLanguage: 'English',
    sourceRecording: { language: 'English', voiceType: 'original', isExplicit: true },
    recordedLanguages: ['English'],
    playbackVariants: [],
    estimatedDurationMs: durationMs,
    requiresManualAdvance: false,
    manualAdvancePrompt: '',
    timingNotes: 'Text-first timing is approximate. Explicit pauses and UI checkpoints are retained for later segment-level voice synthesis.',
    events: buildReplayEvents(id, actions),
    audioClips: [],
    playbackMode: 'synthesized',
    voiceDataUrl: null,
    voiceMimeType: null,
    voiceAssetId: '',
    voiceAssetUrl: '',
    capturedImages: [],
    posterImageDataUrl: null,
    posterMimeType: 'image/webp',
    posterAssetId: '',
    posterAssetUrl: '',
  };
}

export function buildNonclinicalSafetyJourney() {
  const createdAt = new Date().toISOString();
  const steps = [
    buildStep({
      id: 'ncs-orientation',
      name: 'Orient the audience',
      title: 'Start with the scientific decision',
      outline: 'Frame the application as an investigation cockpit, then introduce the seven-chapter learning path.',
      whyMongo: 'The demonstration keeps standardized evidence, operational projections, semantic meaning, and review state connected without collapsing them into one source of truth.',
      actions: [{ actionId: 'open-learning-journey', selector: '[data-sherpa-action="open-learning-journey"]', expectedState: 'learning-journey' }],
      narration: [
        { text: 'This demonstration begins with the scientific decision, not with artificial intelligence. A safety signal is a reason to investigate; it is not automatically an adverse effect or a regulatory conclusion.', pauseMs: 700 },
        { text: 'The built-in learning journey gives a concise orientation to the people, evidence, workflow, and trust boundaries behind the application.', checkpointState: 'learning-journey', pauseMs: 500 },
      ],
    }),
    buildStep({
      id: 'ncs-evidence',
      name: 'Inspect the SEND evidence workspace',
      title: 'Move from a standardized study to an evidence landscape',
      outline: 'Open the study workspace and establish the immutable study snapshot, dose groups, animals, and canonical SEND records.',
      whyMongo: 'MongoDB preserves the canonical SEND record envelope while materializing bounded, rebuildable views for interactive investigation.',
      actions: [{ actionId: 'open-signal-workspace', selector: '[data-sherpa-action="open-signal-workspace"]', expectedState: 'signal-workspace' }],
      narration: [
        { text: 'The workspace is grounded in a checksum-pinned public SEND study. The headline metrics establish the study population, treatment groups, and volume of canonical source evidence.', pauseMs: 650 },
        { text: 'The application does not replace the standard. It derives an investigation-ready view while keeping every result traceable to the original study snapshot.', checkpointState: 'signal-workspace', pauseMs: 500 },
      ],
    }),
    buildStep({
      id: 'ncs-triage',
      name: 'Triage the signal landscape',
      title: 'Prioritize review without claiming causality',
      outline: 'Use the dose-by-organ matrix and ranked signal list to choose an evidence thread for expert review.',
      whyMongo: 'Document-shaped projections join study, subject, dose, pathology, and laboratory context for rapid visual exploration while preserving source identifiers.',
      actions: [{ actionId: 'open-signal-workspace', selector: '[data-sherpa-action="open-signal-workspace"]', expectedState: 'signal-workspace' }],
      narration: [
        { text: 'The dose-by-organ matrix shows where findings occur across treatment groups. The ranking helps the toxicologist decide what to inspect first, but it remains a review heuristic.', pauseMs: 800 },
        { text: 'Selecting a finding synchronizes incidence, laboratory context, evidence relationships, and the investigator. The same evidence thread remains visible across every analytical view.', checkpointState: 'signal-workspace', pauseMs: 500 },
      ],
    }),
    buildStep({
      id: 'ncs-investigation',
      name: 'Open the Investigation Room',
      title: 'Test a hypothesis with governed evidence',
      outline: 'Open the Investigation Room and explain its biological-coherence, source-record, literature, graph, and execution-plan views.',
      whyMongo: 'Governed resolvers bind the exact study, signal, role, and immutable snapshot before retrieval, graph expansion, or AI synthesis runs.',
      actions: [{ actionId: 'open-investigation-room', selector: '[data-sherpa-action="open-investigation-room"]', expectedState: 'investigation-room' }],
      narration: [
        { text: 'The Investigation Room tests a focused hypothesis using exact SEND records, dose context, related measurements, semantic evidence, and attributed literature.', pauseMs: 700 },
        { text: 'The agent coordinates evidence rather than deciding the science. Its plan, executed operations, fallbacks, citations, and uncertainty remain inspectable, and the expert owns the final assessment.', checkpointState: 'investigation-room', pauseMs: 600 },
      ],
    }),
    buildStep({
      id: 'ncs-portfolio',
      name: 'Compare the portfolio',
      title: 'Separate observed evidence from evaluation data',
      outline: 'Open portfolio similarity and compare the selected finding across observed public studies and clearly labeled synthetic benchmarks.',
      whyMongo: 'Atlas supports exact filters, semantic retrieval, vector similarity, and graph context while preserving evidence-class boundaries in every result.',
      actions: [
        { actionId: 'open-signal-workspace', selector: '[data-sherpa-action="open-signal-workspace"]', expectedState: 'signal-workspace', atMs: 0 },
        { actionId: 'open-portfolio', selector: '[data-sherpa-action="open-portfolio"]', expectedState: 'portfolio', atMs: 900 },
      ],
      narration: [
        { text: 'Portfolio similarity asks whether a governed finding resembles patterns in other studies. It combines semantic, dose-pattern, severity, and vector-ready retrieval lanes.', pauseMs: 700 },
        { text: 'Observed studies and synthetic benchmarks remain visibly separate. Similarity suggests where to look; it does not turn a benchmark or a neighboring study into scientific proof.', checkpointState: 'portfolio', pauseMs: 500 },
      ],
    }),
    buildStep({
      id: 'ncs-semantics',
      name: 'Inspect governed meaning',
      title: 'Resolve ambiguity through the semantic map',
      outline: 'Open the semantic model and inspect concepts, value sets, archetypes, placements, capabilities, and resolver contracts.',
      whyMongo: 'A portable semantic release can map governed meaning to documents, search indexes, graph edges, and APIs without hiding physical placement.',
      actions: [{ actionId: 'open-semantic-model', selector: '[data-sherpa-action="open-semantic-model"]', expectedState: 'semantic-model' }],
      narration: [
        { text: 'When a term is ambiguous, the user can inspect the semantic map instead of accepting a guessed interpretation. Concepts, terminology, archetypes, and physical bindings are versioned together.', pauseMs: 750 },
        { text: 'The active profile controls visible meaning and authorized capabilities. A resolver compiles that governed intent into concrete operations while keeping the selected interpretation visible.', checkpointState: 'semantic-model', pauseMs: 500 },
      ],
    }),
    buildStep({
      id: 'ncs-architecture',
      name: 'Explain the deployment boundary',
      title: 'Show how the reference solution fits together',
      outline: 'Open Solution architecture and distinguish build-time enablement from the deployed application, database, APIs, and agent.',
      whyMongo: 'The architecture combines the document model, Atlas Search and Vector Search, graph-style relationships, change streams, and governed AI orchestration.',
      actions: [
        { actionId: 'open-semantic-model', selector: '[data-sherpa-action="open-semantic-model"]', expectedState: 'semantic-model', atMs: 0 },
        { actionId: 'open-architecture', selector: '[data-sherpa-action="open-architecture"]', expectedState: 'architecture', atMs: 900 },
      ],
      narration: [
        { text: 'The architecture view separates source standards, build-time tooling, runtime data services, retrieval, the investigator, and expert review.', pauseMs: 700 },
        { text: 'Healthcare Data Lab and Context Studio prepare governed assets. The deployed solution remains self-contained: MongoDB, application APIs, the optional agent, and the human review workflow form the runtime boundary.', checkpointState: 'architecture', pauseMs: 500 },
      ],
    }),
    buildStep({
      id: 'ncs-trust',
      name: 'Finish with audit and lineage',
      title: 'Defend the result from source to decision',
      outline: 'Open Audit and lineage, then follow source artifacts, immutable snapshots, resolver execution, citations, and expert review actions.',
      whyMongo: 'Immutable evidence and append-only decisions coexist with rebuildable projections, making the demo explainable without making generated prose authoritative.',
      actions: [{ actionId: 'open-audit-lineage', selector: '[data-sherpa-action="open-audit-lineage"]', expectedState: 'audit-lineage' }],
      narration: [
        { text: 'A trustworthy result ends with evidence lineage, not generated prose. Every assertion should lead back to a source artifact, canonical record, semantic release, and the operations that actually ran.', pauseMs: 800 },
        { text: 'The final assessment remains a human-owned, append-only decision. Sherpa can now use these text segments for browser narration, and later replace each segment with generated audio without forcing exact full-step synchronization.', checkpointState: 'audit-lineage', pauseMs: 600 },
      ],
    }),
  ];

  return {
    id: NONCLINICAL_SAFETY_JOURNEY_ID,
    seedVersion: NONCLINICAL_SAFETY_SEED_VERSION,
    name: 'From SEND evidence to a defensible safety hypothesis',
    description: 'An informal, text-first tour of the AI-Ready Nonclinical Safety reference application, prepared for segment-level voice synthesis.',
    context: {
      ...NONCLINICAL_SAFETY_DEMO_CONTEXT,
      industries: ['Healthcare and Life Sciences', 'Pharmaceuticals'],
      products: ['MongoDB Atlas', 'Atlas Search', 'Atlas Vector Search'],
      businessCases: ['Nonclinical safety review', 'Evidence traceability', 'AI-assisted investigation'],
      targetAudiences: ['Toxicologists', 'Study directors', 'Data stewards', 'Solution architects'],
      useCases: ['SEND evidence exploration', 'Signal triage', 'Governed investigation', 'Audit and lineage'],
      valueHighlights: ['Connected evidence', 'Explainable retrieval', 'Human accountability'],
    },
    guidance: {
      presenterNotes: 'Keep the tone conversational. Lead with the scientific question, distinguish prioritization from causality, and finish every AI claim with evidence and human accountability.',
      generatedNarrative: 'Start with the study, narrow to a signal, test the hypothesis, resolve meaning, inspect the architecture, and finish with provenance and expert review.',
      generatedAt: createdAt,
    },
    governance: {
      ownerId: 'nonclinical-safety-demo-team',
      ownerName: 'Nonclinical Safety Demo Team',
      ownerEmail: 'nonclinical-safety-demo@mongodb.com',
      editorIds: [],
      visibility: 'team',
      publicationStatus: 'review',
      isRecommended: true,
    },
    createdBy: 'nonclinical-safety-demo-team',
    updatedBy: 'nonclinical-safety-demo-team',
    steps,
    createdAt,
    updatedAt: createdAt,
  };
}
