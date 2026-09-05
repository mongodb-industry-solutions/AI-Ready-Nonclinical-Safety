import type { EvidenceClass, PortfolioSimilarityMatch, PortfolioSimilarityResult, SafetySignal, StudyEvidence } from '@/lib/contracts';

const defaultReleaseId = 'org.contextobjects.nonclinical-safety@0.4.1';
const severityKeys = ['ungraded', 'minimal', 'slight', 'mild', 'moderate', 'marked', 'severe'];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function tokens(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function jaccard(left: Set<string>, right: Set<string>) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function incidenceRates(evidence: StudyEvidence, signal: SafetySignal) {
  return evidence.doseGroups.map((group, index) => (signal.incidence[index] || 0) / Math.max(group.animalCount, 1));
}

function incidenceSimilarity(leftEvidence: StudyEvidence, left: SafetySignal, rightEvidence: StudyEvidence, right: SafetySignal) {
  const a = incidenceRates(leftEvidence, left);
  const b = incidenceRates(rightEvidence, right);
  const width = Math.max(a.length, b.length);
  const valueAt = (values: number[], index: number) => values[Math.min(values.length - 1, Math.round(index * (values.length - 1) / Math.max(width - 1, 1)))] || 0;
  const distance = Array.from({ length: width }, (_, index) => Math.abs(valueAt(a, index) - valueAt(b, index))).reduce((sum, value) => sum + value, 0) / width;
  return clamp(1 - distance);
}

function severityVector(signal: SafetySignal) {
  const total = Object.values(signal.severity).reduce((sum, value) => sum + value, 0) || 1;
  return severityKeys.map((key) => (signal.severity[key] || 0) / total);
}

function cosine(left: number[], right: number[]) {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] || 0), 0);
  const magnitude = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return dot / Math.max(magnitude(left) * magnitude(right), Number.EPSILON);
}

function evidenceClass(evidence: StudyEvidence): EvidenceClass {
  return evidence.study.evidenceClass || (evidence.study.id.startsWith('NCS-BENCH-') ? 'synthetic-benchmark' : 'sponsor-observed');
}

export function comparePortfolio(
  evidenceSet: StudyEvidence[],
  studyId: string,
  signalId: string,
  limit = 8,
  semanticReleaseId = defaultReleaseId,
  vectorScores: ReadonlyMap<string, number> | null = null,
  dataOperations: PortfolioSimilarityResult['execution']['dataOperations'] = [],
): PortfolioSimilarityResult {
  const queryEvidence = evidenceSet.find((item) => item.study.id === studyId);
  if (!queryEvidence) throw new Error(`Study ${studyId} is not available in the portfolio corpus`);
  const querySignal = queryEvidence.signals.find((item) => item.id === signalId);
  if (!querySignal) throw new Error(`Signal ${signalId} is not available in study ${studyId}`);

  const candidates = evidenceSet.flatMap((item) => item.signals.map((signal) => ({ evidence: item, signal })))
    .filter(({ evidence }) => evidence.study.id !== studyId)
    .map(({ evidence, signal }) => {
      const semantic = clamp((querySignal.organ === signal.organ ? 0.62 : 0) + 0.38 * jaccard(tokens(`${querySignal.organ} ${querySignal.finding}`), tokens(`${signal.organ} ${signal.finding}`)));
      const incidence = incidenceSimilarity(queryEvidence, querySignal, evidence, signal);
      const severity = clamp(cosine(severityVector(querySignal), severityVector(signal)));
      const candidateId = `${evidence.study.id}:${evidence.study.snapshotId}:${signal.id}`;
      const vectorScore = vectorScores?.get(candidateId) ?? null;
      return { evidence, signal, semantic, incidence, severity, vector: vectorScore };
    });

  const laneRanks = ['semantic', 'incidence', 'severity', 'vector'] as const;
  const ranks = new Map<string, number>();
  for (const lane of laneRanks) {
    const ranked = candidates.filter((item) => item[lane] != null).sort((a, b) => (b[lane] || 0) - (a[lane] || 0));
    ranked.forEach((item, index) => {
      const id = `${item.evidence.study.id}:${item.evidence.study.snapshotId}:${item.signal.id}`;
      ranks.set(id, (ranks.get(id) || 0) + 1 / (60 + index + 1));
    });
  }
  const maxRrf = Math.max(...ranks.values(), 1 / 61);
  const vectorExecuted = vectorScores !== null;
  const matches: PortfolioSimilarityMatch[] = candidates.map((item): PortfolioSimilarityMatch => {
    const id = `${item.evidence.study.id}:${item.evidence.study.snapshotId}:${item.signal.id}`;
    const domainScore = vectorExecuted
      ? item.semantic * 0.34 + item.incidence * 0.29 + item.severity * 0.17 + (item.vector || 0) * 0.20
      : item.semantic * 0.42 + item.incidence * 0.40 + item.severity * 0.18;
    const score = Math.round(100 * (domainScore * 0.72 + ((ranks.get(id) || 0) / maxRrf) * 0.28));
    const sameOrgan = item.signal.organ === querySignal.organ;
    const sharedDomains = queryEvidence.study.domains.filter((domain) => item.evidence.study.domains.includes(domain));
    const speciesKnown = Boolean(queryEvidence.study.species && item.evidence.study.species);
    const strainKnown = Boolean(queryEvidence.study.strain && item.evidence.study.strain);
    return {
      id,
      study: item.evidence.study,
      signal: item.signal,
      evidenceClass: evidenceClass(item.evidence),
      score,
      rank: 0,
      lanes: [
        { id: 'semantic', label: 'Semantic concepts', score: Math.round(item.semantic * 100), status: 'executed', detail: sameOrgan ? `Shared ${querySignal.organ} concept and terminology path` : 'Related through finding terminology only' },
        { id: 'incidence', label: 'Dose pattern', score: Math.round(item.incidence * 100), status: 'executed', detail: 'Normalized group incidence shape; dose-grid independent' },
        { id: 'severity', label: 'Severity profile', score: Math.round(item.severity * 100), status: 'executed', detail: 'Cosine similarity across ordered severity proportions' },
        { id: 'vector', label: 'Vector meaning', score: item.vector == null ? null : Math.round(item.vector * 100), status: item.vector == null ? 'skipped' : 'executed', detail: item.vector == null ? 'The automated-embedding candidate set did not include this finding' : 'Atlas Automated Embedding similarity over the governed finding text projection' },
      ],
      comparability: [
        { id: 'target-organ', label: 'Target organ', status: sameOrgan ? 'matched' : 'different', detail: sameOrgan ? `Both findings resolve to ${querySignal.organ}` : `${querySignal.organ} compared with ${item.signal.organ}` },
        { id: 'species', label: 'Species', status: !speciesKnown ? 'unknown' : queryEvidence.study.species === item.evidence.study.species ? 'matched' : 'different', detail: speciesKnown ? `${queryEvidence.study.species} ↔ ${item.evidence.study.species}` : 'Species was not supplied for both studies' },
        { id: 'strain', label: 'Strain', status: !strainKnown ? 'unknown' : queryEvidence.study.strain === item.evidence.study.strain ? 'matched' : 'different', detail: strainKnown ? `${queryEvidence.study.strain} ↔ ${item.evidence.study.strain}` : 'Strain was not supplied for both studies' },
        { id: 'implementation-guide', label: 'SEND profile', status: queryEvidence.study.implementationGuide === item.evidence.study.implementationGuide ? 'matched' : 'partial', detail: `${queryEvidence.study.implementationGuide} ↔ ${item.evidence.study.implementationGuide}` },
        { id: 'domain-overlap', label: 'Evidence coverage', status: sharedDomains.length === queryEvidence.study.domains.length && sharedDomains.length === item.evidence.study.domains.length ? 'matched' : 'partial', detail: `${sharedDomains.length} shared domains · ${queryEvidence.study.domains.length} query / ${item.evidence.study.domains.length} comparator` },
      ],
      explanation: sameOrgan
        ? `Same target organ; dose pattern is ${Math.round(item.incidence * 100)}% similar after normalization.`
        : `Different target organ; retained as a contrast because its dose pattern is ${Math.round(item.incidence * 100)}% similar.`,
    };
  }).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 20)));
  matches.forEach((item, index) => { item.rank = index + 1; });

  const classes = evidenceSet.map(evidenceClass);
  return {
    query: { study: queryEvidence.study, signal: querySignal },
    matches,
    corpus: {
      studies: evidenceSet.length,
      findings: evidenceSet.reduce((sum, item) => sum + item.signals.length, 0),
      observedStudies: classes.filter((item) => item !== 'synthetic-benchmark').length,
      syntheticStudies: classes.filter((item) => item === 'synthetic-benchmark').length,
    },
    execution: {
      mode: vectorExecuted ? 'explainable-hybrid-vector' : 'explainable-hybrid',
      semanticReleaseId,
      vectorLane: vectorExecuted ? 'executed' : 'skipped-no-vector-candidates',
      boundary: 'Cross-study matches are contextual comparators, not pooled historical controls. Species, strain, SEND profile, domain coverage, and evidence class remain visible; synthetic benchmarks never become observed evidence.',
      dataOperations,
    },
  };
}
