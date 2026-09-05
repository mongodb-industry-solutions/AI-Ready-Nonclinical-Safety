export type ReviewPriority = 'high' | 'medium' | 'context' | 'low';
export type EvidenceClass = 'observed-public' | 'synthetic-benchmark' | 'sponsor-observed';

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
  evidenceClass?: EvidenceClass;
  species?: string;
  strain?: string;
  compoundName?: string;
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
  correlatedLab?: string;
  sourceRecordIds?: string[];
  sourceRecordHashes?: string[];
  projectionRuleId?: string;
}

export interface LabSeries {
  label: string;
  unit: string;
  points: Array<{ day: number } & Record<string, number>>;
  sourceRecordIds?: string[];
  sourceRecordHashes?: string[];
}

export interface StudyEvidence {
  study: StudySummary;
  doseGroups: DoseGroup[];
  signals: SafetySignal[];
  labSeries?: Record<string, LabSeries>;
  provenance: {
    derivedAt: string;
    method: string;
    disclaimer: string;
    sourceArtifacts?: Record<string, string>;
    evidencePackageId?: string;
    evidencePackageDigest?: { algorithm: 'sha256'; value: string };
    modelSchemaVersion?: string;
    projectionVersion?: string;
    projectionDigest?: { algorithm: 'sha256'; value: string };
    projectionRuleIds?: string[];
    syntheticRecipe?: {
      generator: string;
      generatorVersion: string;
      scenario: string;
      seed: number;
      recipeDigest: string;
      modelDigest: string;
    };
    reconciliation?: {
      status: 'reconciled';
      canonicalRecordCount: number;
      projectedDomainCounts: Record<string, number>;
      animalCount: number;
      checks: {
        domainCountsMatch: boolean;
        recordCountMatches: boolean;
        subjectCountMatches: boolean;
      };
    };
  };
}

export interface SimilarityLaneScore {
  id: 'semantic' | 'incidence' | 'severity' | 'vector';
  label: string;
  score: number | null;
  status: 'executed' | 'skipped';
  detail: string;
}

export interface PortfolioSimilarityMatch {
  id: string;
  study: StudySummary;
  signal: SafetySignal;
  evidenceClass: EvidenceClass;
  score: number;
  rank: number;
  lanes: SimilarityLaneScore[];
  explanation: string;
}

export interface PortfolioSimilarityResult {
  query: { study: StudySummary; signal: SafetySignal };
  matches: PortfolioSimilarityMatch[];
  corpus: {
    studies: number;
    findings: number;
    observedStudies: number;
    syntheticStudies: number;
  };
  execution: {
    mode: 'explainable-hybrid' | 'explainable-hybrid-vector';
    semanticReleaseId: string;
    vectorLane: 'executed' | 'skipped-no-vector-candidates';
    boundary: string;
  };
}

export interface CanonicalEvidenceRecord {
  sourceId: string;
  domain: string;
  rowOrdinal: number;
  recordKey: Record<string, unknown>;
  facets: Record<string, unknown>;
  data: Record<string, unknown>;
  lineage: {
    sourceArtifactId?: string;
    sourceDataset: string;
    sourceRow: number;
    recordHash: string;
  };
}

export interface SubjectEvidenceThread {
  subjectId: string;
  treatmentGroup?: string;
  domainCounts: Record<string, number>;
  findingRecords: CanonicalEvidenceRecord[];
  laboratoryRecords: CanonicalEvidenceRecord[];
  demographicRecord?: CanonicalEvidenceRecord;
}

export interface SourceArtifactEvidence {
  sourceId: string;
  sourceName?: string;
  mediaType: string;
  size?: number;
  digest: { algorithm: 'sha256'; value: string };
}

export interface CanonicalDomainInventory {
  domain: string;
  studyRecords: number;
}

export interface CanonicalRecordPage {
  available: boolean;
  studyId: string;
  snapshotId: string;
  scope: 'subject' | 'study';
  subjectId?: string;
  domain: string;
  filter: 'all' | 'outside-range' | 'linked-test' | 'unassessed';
  offset: number;
  limit: number;
  total: number;
  records: CanonicalEvidenceRecord[];
}

export interface SignalRecordEvidence {
  available: boolean;
  studyId: string;
  snapshotId: string;
  signalId: string;
  packageId?: string;
  modelSchemaVersion?: string;
  subjects: SubjectEvidenceThread[];
  treatmentRecords: CanonicalEvidenceRecord[];
  sourceArtifacts: SourceArtifactEvidence[];
  domainInventory: CanonicalDomainInventory[];
  counts: { findings: number; laboratory: number; subjects: number; artifacts: number };
}

export interface DataQueryTrace {
  id: string;
  source: 'mongodb' | 'portable-bundle';
  collection: string;
  operation: 'find' | 'findOne' | 'aggregate' | 'insertOne' | 'fixture-read';
  predicate: Record<string, unknown>;
  status: 'executed' | 'fallback' | 'skipped';
  resultCount: number;
  durationMs: number;
  plan?: {
    source: 'mongodb-explain-executionStats';
    indexes: string[];
    documentsExamined?: number;
    keysExamined?: number;
    rowsReturned?: number;
  };
}

export interface OperationalEvidenceGroup {
  code?: string;
  label?: string;
  dose?: number;
  unit?: string;
}

export interface EndpointSummary {
  id: string;
  endpointType: 'categorical' | 'numeric';
  domain: string;
  testCode: string;
  test: string;
  organ?: string;
  finding?: string;
  studyDay?: number;
  phase?: string;
  sex?: string;
  group?: OperationalEvidenceGroup;
  incidence?: { affected: number; examined: number; percent: number };
  severity?: Record<string, number>;
  statistics?: { count: number; subjectCount: number; mean: number; min: number; max: number };
  referenceRange?: { status: 'source-supplied' | 'not-supplied'; assessedCount: number; outsideRangeCount: number };
  sourceRecordIds: string[];
  projectionDigest: string;
  projectionVersion: string;
  semanticReleaseId: string;
}

export interface MeasurementSeriesPoint {
  endpointSummaryId: string;
  studyDay?: number;
  group?: OperationalEvidenceGroup;
  statistics: { count: number; subjectCount: number; mean: number; min: number; max: number };
  referenceRange?: { status: 'source-supplied' | 'not-supplied'; assessedCount: number; outsideRangeCount: number };
}

export interface OperationalMeasurementSeries {
  id: string;
  domain: string;
  testCode: string;
  test: string;
  organ?: string;
  unit?: string;
  sex?: string;
  phase?: string;
  points: MeasurementSeriesPoint[];
  sourceRecordIds: string[];
  projectionDigest: string;
  projectionVersion: string;
  semanticReleaseId: string;
}

export interface OperationalEvidenceRelationship {
  id: string;
  from: string;
  to: string;
  fromSemanticObject: string;
  toSemanticObject: string;
  predicate: string;
  authority: 'source-declared' | 'governed-inference';
  relationId?: string;
  ruleId?: string;
  subjectId?: string;
  sourceRecordIds: string[];
  projectionDigest: string;
}

export interface BiologicalCoherenceResponse {
  available: boolean;
  studyId: string;
  snapshotId: string;
  signalId: string;
  organ: string;
  semanticReleaseId: string;
  targetOrgan: {
    endpointSummaries: EndpointSummary[];
    measurementSeries: OperationalMeasurementSeries[];
  };
  systemicContext: {
    bodyWeightSeries: OperationalMeasurementSeries[];
    exposureSeries: OperationalMeasurementSeries[];
    laboratoryCoverage: {
      endpointSummaryCount: number;
      sourceRangeSummaryCount: number;
      outsideRangeSummaryCount: number;
      interpretation: string;
    };
  };
  relationships: OperationalEvidenceRelationship[];
  filters: { sexes: string[]; phases: string[] };
  inventory: {
    endpointSummaries: number;
    measurementSeries: number;
    sourceDeclaredRelationships: number;
    sourceRecordCitations: number;
  };
  execution: {
    resolverId: string;
    capabilityId: string;
    executor: string;
    policies: string[];
    declaredStages: string[];
    containmentPlan?: SemanticResolver['containmentPlan'];
    dataOperations: DataQueryTrace[];
    executedAt: string;
  };
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
  status: 'complete' | 'skipped' | 'fallback';
  detail: string;
}

export interface InvestigationWidget {
  id: string;
  kind: 'dose-response' | 'laboratory-trajectory' | 'biological-coherence' | 'semantic-grounding' | 'execution-plan' | 'evidence-topology';
  title: string;
  sourceDomains: string[];
}

export interface InvestigationExecutionContract {
  apiVersion: 'nonclinical-safety.dev/investigation-execution/v1';
  resolverId: string;
  capabilityId: string;
  semanticReleaseId: string;
  executor: string;
  inputSchema: Record<string, string>;
  outputSchema: string;
  policies: string[];
  declaredStages: string[];
  executedStages: InvestigationStep[];
  dataOperations: DataQueryTrace[];
  retrievalExecutions: {
    semantic?: Pick<SemanticGroundingResult, 'mode' | 'query' | 'stages' | 'managedEmbedding'>;
    literature?: LiteratureQueryExecution;
  };
  executedAt: string;
  boundScope: {
    studyId: string;
    snapshotId: string;
    signalId: string;
    profileId: SemanticProfileId;
  };
  queryShape: {
    readCollections: string[];
    auditWriteCollection: 'investigations';
    predicates: Record<string, Array<Record<string, unknown>>>;
    immutableEvidence: true;
  };
}

export interface InvestigationResult {
  answer: string;
  confidence: 'hypothesis' | 'review' | 'strong-pattern';
  citations: Citation[];
  steps: InvestigationStep[];
  widgets: InvestigationWidget[];
  guardrails: {
    readOnly: true;
    snapshotBound: true;
    regulatoryConclusion: false;
  };
  provider: 'deterministic' | 'magenta';
  /** Snapshot-bound operational evidence assembled by the biological-coherence resolver. */
  coherence?: BiologicalCoherenceResponse;
  /** Profile-scoped lexical + Atlas-managed-vector grounding executed with the investigation. */
  semanticGrounding?: SemanticGroundingResult;
  /** Governed literature containment, hybrid retrieval, fusion, and reranking result. */
  literatureEvidence?: Omit<LiteratureQueryResponse, 'source' | 'plan'>;
  /** Why the deterministic investigator answered. Absent when Magenta responded. */
  fallbackReason?: string;
  execution?: InvestigationExecutionContract;
}

export type SemanticProfileId = 'toxicologist' | 'study-director' | 'data-steward' | 'portfolio-lead' | 'external-reviewer';

export interface SemanticObject {
  id: string;
  label: string;
  kind: 'business' | 'evidence' | 'governance' | 'intelligence' | 'workflow';
  description: string;
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
  containmentPlan?: {
    language: 'contextobjects-containment-v1';
    semantics: 'AQL-CONTAINS';
    rootArchetype: string;
    contains: string[];
    compileTargets: string[];
  };
}

export interface HybridQueryPlan {
  resolverId: string;
  capabilityId: string;
  profileId: SemanticProfileId;
  semanticScope: {
    language: 'contextobjects-containment-v1';
    semantics: 'AQL-CONTAINS';
    rootArchetype: string;
    contains: string[];
  };
  physicalTarget: 'mongodb';
  stages: Array<{ id: string; engine: string; purpose: string }>;
  fusion: 'reciprocal-rank-fusion';
  finalRanking: 'domain-reranker';
}

export type RetrievalStageStatus = 'executed' | 'fallback' | 'skipped';

export interface RetrievalStageResult {
  id: 'containment' | 'lexical' | 'vector' | 'graph' | 'fuse' | 'rerank' | 'hydrate';
  status: RetrievalStageStatus;
  candidateCount: number;
  durationMs: number;
  detail: string;
}

export interface LiteratureQueryExecution {
  mode: 'fixture' | 'mongodb-exact' | 'atlas-search' | 'atlas-hybrid';
  source: 'portable-bundle' | 'mongodb';
  semanticReleaseId: string;
  profileId: SemanticProfileId;
  query: string;
  durationMs: number;
  executedAt: string;
  stages: RetrievalStageResult[];
}

export interface SemanticAction {
  id: string;
  label: string;
  allowedProfiles: SemanticProfileId[];
  writesCollection: 'review_actions' | 'target_organ_assessments';
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

export interface SemanticSearchHit {
  resourceType: 'object' | 'profile' | 'capability' | 'resolver' | 'action' | 'surface' | 'valueSet' | 'concept' | 'archetype' | 'storageBinding' | 'sourceAdapter' | 'subscription' | 'edge';
  resourceId: string;
  label: string;
  excerpt: string;
  score: number;
  lanes: Array<'lexical' | 'vector'>;
  sourceRef: string;
}

export interface SemanticGroundingResult {
  query: string;
  mode: 'portable-bundle' | 'mongodb-exact' | 'atlas-search' | 'atlas-hybrid';
  hits: SemanticSearchHit[];
  stages: Array<{ id: string; status: 'executed' | 'fallback' | 'skipped'; detail: string }>;
  managedEmbedding: {
    index: string;
    sourcePath: string;
    vectorStorage: string;
    vectorFieldInSourceDocument: boolean;
  };
  releaseId: string;
  profileId: SemanticProfileId;
}

export interface SemanticSourceAdapter {
  id: string;
  kind: 'database' | 'api' | 'object-storage' | 'document-corpus';
  role: string;
  changeFeed: string;
}

export interface SemanticConcept {
  id: string;
  label: string;
  kind: 'concept' | 'taxonomy' | 'terminology';
  broader?: string;
  synonyms?: string[];
  valueSet?: string;
  externalMappings?: string[];
  semanticObjects: string[];
}

export interface SemanticArchetype {
  id: string;
  label: string;
  description: string;
  extends?: string;
  members: Array<{ role: string; semanticObject: string; cardinality: string }>;
}

export interface SemanticStorageBinding {
  id: string;
  semanticObject: string;
  archetype: string;
  adapter: string;
  representation: 'document' | 'embedded-fragment' | 'object' | 'api-resource';
  location: string;
  path: string;
  authority: 'source' | 'projection' | 'solution-state';
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
  taxonomy: { concepts: SemanticConcept[] };
  archetypes: SemanticArchetype[];
  storageBindings: SemanticStorageBinding[];
  sourceAdapters: SemanticSourceAdapter[];
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

export type TargetOrganConclusion = 'TARGET ORGAN' | 'NOT TARGET ORGAN' | 'INDETERMINATE';
export type AdversityDecision = 'ADVERSE' | 'NON-ADVERSE' | 'EQUIVOCAL' | 'NOT ASSESSED';
export type ReversibilityDecision = 'RECOVERED' | 'PARTIALLY RECOVERED' | 'PERSISTENT' | 'NOT ASSESSED';

export interface TargetOrganAssessmentRecord {
  id: string;
  apiVersion: 'nonclinical-safety.dev/target-organ-assessment/v1';
  studyId: string;
  snapshotId: string;
  signalId: string;
  organ: string;
  profileId: SemanticProfileId;
  targetOrganConclusion: TargetOrganConclusion;
  adversityDecision: AdversityDecision;
  reversibility: ReversibilityDecision;
  rationale: string;
  citedEndpointIds: string[];
  citedSourceRecordIds: string[];
  semanticReleaseId: string;
  resolverId: string;
  status: 'committed' | 'pending-approval';
  createdAt: string;
  assessmentDigest: string;
}

export interface LiteratureDocument {
  id: string;
  pmid: string;
  doi: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  publicationType: string;
  url: string;
  evidenceRole: 'pathology-reference' | 'analogous-pattern' | 'alternative-explanation';
  relevance: string;
  concepts: string[];
  matchedSignalIds: string[];
}

export interface RankedLiteratureDocument extends LiteratureDocument {
  retrieval: {
    rank: number;
    score: number;
    lanes: Array<'containment' | 'lexical' | 'vector' | 'graph'>;
    source: 'portable-bundle' | 'mongodb';
  };
}

export interface LiteratureQueryResponse {
  source: LiteratureEvidence['source'];
  plan: HybridQueryPlan;
  execution: LiteratureQueryExecution;
  documents: RankedLiteratureDocument[];
}

export interface LiteratureEvidence {
  source: {
    provider: string;
    retrievedAt: string;
    usage: string;
    fullTextPolicy: string;
  };
  documents: LiteratureDocument[];
}
