export type ReviewPriority = 'high' | 'medium' | 'context' | 'low';

export interface StudySummary {
  id: string;
  title: string;
  profile: string;
  implementationGuide: string;
  snapshotId: string;
  state: string;
  source: string;
  sourceRevision: string;
  license: string;
  recordCount: number;
  animalCount: number;
  domains: string[];
  domainCounts: Record<string, number>;
}

export interface DoseGroup {
  code: string;
  label: string;
  dose: number;
  unit: string;
  animalCount: number;
}

export interface SafetySignal {
  id: string;
  organ: string;
  finding: string;
  affectedAnimals: number;
  totalAnimals: number;
  reviewPriority: ReviewPriority;
  pattern: string;
  incidence: number[];
  severity: Record<string, number>;
  correlatedLab: string | null;
}

export interface LabSeries {
  label: string;
  unit: string;
  points: Array<{ day: number } & Record<string, number>>;
}

export interface StudyEvidence {
  study: StudySummary;
  doseGroups: DoseGroup[];
  signals: SafetySignal[];
  labSeries: Record<string, LabSeries>;
  provenance: { derivedAt: string; method: string; disclaimer: string };
}

export interface Citation {
  domain: string;
  label: string;
  detail: string;
  sourceRef: string;
}

export interface InvestigationStep {
  id: string;
  label: string;
  engine: 'structured' | 'vector' | 'graph' | 'rerank' | 'synthesis';
  status: 'complete' | 'planned' | 'fallback';
  detail: string;
}

export interface InvestigationResult {
  answer: string;
  confidence: 'hypothesis' | 'review' | 'strong-pattern';
  citations: Citation[];
  steps: InvestigationStep[];
  guardrails: {
    readOnly: true;
    snapshotBound: true;
    regulatoryConclusion: false;
  };
  provider: 'deterministic' | 'magenta';
}

export type SemanticProfileId = 'toxicologist' | 'study-director' | 'data-steward' | 'portfolio-lead' | 'external-reviewer';

export interface SemanticObject {
  id: string;
  label: string;
  kind: 'business' | 'evidence' | 'governance' | 'intelligence' | 'workflow';
  description: string;
  collection: string;
  documentPath: string;
  sourceDomains?: string[];
  terminology?: string[];
  retrieval: string[];
  visibleTo: SemanticProfileId[];
  position: { x: number; y: number };
}

export interface SemanticEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  predicate: string;
}

export interface SemanticProfile {
  id: SemanticProfileId;
  label: string;
  description: string;
  grants: string[];
  hiddenObjects?: string[];
  maskedFields: string[];
}

export interface SemanticCapability {
  id: string;
  label: string;
  mode: 'read' | 'write';
  description: string;
  engines: string[];
  reads: string[];
  indexes: string[];
  allowedProfiles: SemanticProfileId[];
}

export interface SemanticResolver {
  id: string;
  capability: string;
  input: Record<string, string>;
  output: string;
  executor: string;
  policy: string[];
  stages: string[];
}

export interface SemanticAction {
  id: string;
  label: string;
  allowedProfiles: SemanticProfileId[];
  writesCollection: 'review_actions';
  approval: string;
  immutableEvidence: true;
}

export interface SemanticSurface {
  id: string;
  label: string;
  description: string;
}

export interface SemanticValueSet {
  id: string;
  label: string;
  binding: string;
  authority: string;
  version: string;
  values: string[];
}

export interface SemanticSubscription {
  id: string;
  transport: string;
  source: string;
  endpoint: string;
  resume: string;
  snapshot: string;
  events: string[];
  policy: string[];
}

export interface SemanticRuntimeBundle {
  apiVersion: 'contextobjects.dev/runtime-bundle/v1';
  kind: 'SemanticRuntimeBundle';
  release: {
    releaseId: string;
    packageId: string;
    version: string;
    title: string;
    maturity: string;
    compiledBy: string;
    sourceStandard: string;
    description: string;
  };
  objects: SemanticObject[];
  edges: SemanticEdge[];
  profiles: SemanticProfile[];
  capabilities: SemanticCapability[];
  resolvers: SemanticResolver[];
  actions: SemanticAction[];
  surfaces: SemanticSurface[];
  valueSets: SemanticValueSet[];
  subscriptions: SemanticSubscription[];
  governance: {
    evidenceCollections: string[];
    solutionWriteCollections: string[];
    writeWorkflow: string[];
    rules: string[];
  };
  contentDigest: string;
}

export interface SemanticRuntimeView extends Omit<SemanticRuntimeBundle, 'objects' | 'edges' | 'capabilities' | 'actions'> {
  activeProfile: SemanticProfile;
  objects: SemanticObject[];
  edges: SemanticEdge[];
  capabilities: SemanticCapability[];
  actions: SemanticAction[];
}

export interface ReviewActionRecord {
  id?: string;
  studyId: string;
  snapshotId: string;
  signalId: string;
  profile: SemanticProfileId;
  action: string;
  note: string;
  status: 'committed' | 'pending-approval';
  createdAt: string;
}
