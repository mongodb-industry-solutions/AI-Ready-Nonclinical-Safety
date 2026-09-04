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
