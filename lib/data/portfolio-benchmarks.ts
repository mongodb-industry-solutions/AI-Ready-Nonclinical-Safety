import type { DoseGroup, SafetySignal, StudyEvidence } from '@/lib/contracts';

const groups: DoseGroup[] = [
  { code: 'G1', label: 'Vehicle control', dose: 0, unit: 'mg/kg/day', animalCount: 10 },
  { code: 'G2', label: 'Low dose', dose: 4, unit: 'mg/kg/day', animalCount: 10 },
  { code: 'G3', label: 'Low-mid dose', dose: 6, unit: 'mg/kg/day', animalCount: 10 },
  { code: 'G4', label: 'Mid-high dose', dose: 8, unit: 'mg/kg/day', animalCount: 10 },
  { code: 'G5', label: 'High dose', dose: 12, unit: 'mg/kg/day', animalCount: 10 },
];

type BenchmarkRecipe = {
  id: string;
  seed: number;
  strain: string;
  thymus: number[];
  lung: number[];
  severity: Record<string, number>;
  lymphocytes: number[][];
  recipeDigest: string;
};

const recipes: BenchmarkRecipe[] = [
  { id: 'NCS-BENCH-042', seed: 42, strain: 'WISTAR', thymus: [0, 3, 7, 9, 8], lung: [6, 5, 4, 4, 6], severity: { minimal: 10, mild: 9, moderate: 8 }, lymphocytes: [[7.139, 7.126, 7.102, 7.240, 7.089], [7.304, 6.825, 6.546, 6.375, 6.439], [7.321, 6.144, 5.673, 5.337, 4.471], [7.333, 5.986, 5.437, 4.641, 3.831]], recipeDigest: 'sha256:d6a2ae5b4bd96e236d614f381362a1b2226f6d400eaa789b3ab91536be2f937d' },
  { id: 'NCS-BENCH-117', seed: 117, strain: 'WISTAR', thymus: [0, 3, 4, 8, 10], lung: [5, 3, 6, 6, 6], severity: { minimal: 7, mild: 8, moderate: 10 }, lymphocytes: [[7.068, 7.223, 7.197, 7.421, 7.245], [7.378, 6.788, 6.836, 6.426, 6.233], [7.370, 6.143, 5.854, 5.264, 4.467], [7.217, 6.014, 5.085, 4.677, 3.192]], recipeDigest: 'sha256:ffc0d46167dbc8d3c94451cdacc131297d11ad612bdc26f59a246be0057b900e' },
  { id: 'NCS-BENCH-203', seed: 203, strain: 'WISTAR', thymus: [0, 2, 5, 8, 10], lung: [4, 5, 6, 3, 4], severity: { minimal: 7, mild: 8, moderate: 10 }, lymphocytes: [[7.400, 7.200, 7.046, 7.089, 7.376], [7.001, 6.900, 6.724, 6.633, 5.927], [7.105, 6.367, 5.929, 5.450, 4.339], [7.528, 5.750, 5.625, 4.616, 3.448]], recipeDigest: 'sha256:4cad0393e0363be4b2d0c35d97a4eb348a908135d81dacfee87daeb0e393e411' },
];

function signal(id: string, organ: string, finding: string, incidence: number[], severity: Record<string, number>, correlatedLab?: string): SafetySignal {
  return {
    id,
    organ,
    finding,
    incidence,
    severity,
    ...(correlatedLab ? { correlatedLab } : {}),
    affectedAnimals: incidence.reduce((sum, value) => sum + value, 0),
    totalAnimals: 50,
    reviewPriority: id.startsWith('thymus') ? 'high' : 'context',
    pattern: incidence[0] === 0 ? 'treated-only' : 'control-and-treated',
    projectionRuleId: `benchmark.${id}.v1`,
  };
}

function evidence(recipe: BenchmarkRecipe): StudyEvidence {
  const signals = [
    signal('thymus-lymphocytes', 'THYMUS', 'Decreased number, lymphocytes, cortex', recipe.thymus, recipe.severity, 'LYM'),
    signal('lung-infiltration', 'LUNG', 'Mononuclear cell infiltration', recipe.lung, { minimal: recipe.lung.reduce((sum, value) => sum + value, 0) }),
  ];
  return {
    study: {
      id: recipe.id,
      title: `Kehrnel benchmark ${recipe.seed}`,
      profile: 'SEND',
      implementationGuide: 'SENDIG 3.0',
      snapshotId: `synthetic-seed-${recipe.seed}-v1`,
      state: 'published',
      source: 'Kehrnel CDISC synthetic data factory',
      sourceRevision: 'generator-2.1.0',
      license: 'Synthetic demonstration data',
      recordCount: 50 + 5 + signals.reduce((sum, item) => sum + item.affectedAnimals, 0) + 200,
      animalCount: 50,
      domains: ['DM', 'TX', 'MI', 'LB'],
      domainCounts: { DM: 50, TX: 5, MI: signals.reduce((sum, item) => sum + item.affectedAnimals, 0), LB: 200 },
      evidenceClass: 'synthetic-benchmark',
      species: 'RAT',
      strain: recipe.strain,
    },
    doseGroups: groups,
    signals,
    labSeries: {
      LYM: {
        label: 'Lymphocytes',
        unit: '10^9/L',
        points: [-14, 8, 22, 29].map((day, dayIndex) => ({
          day,
          ...Object.fromEntries(groups.map((group, groupIndex) => [String(group.dose), recipe.lymphocytes[dayIndex][groupIndex]])),
        })),
      },
    },
    provenance: {
      derivedAt: '2026-09-05T00:00:00Z',
      method: `Kehrnel CDISC synthetic data factory 2.1.0 · safety-signal recipe · deterministic seed ${recipe.seed}`,
      disclaimer: 'Synthetic benchmark only. It is not observed evidence, a historical control, or a toxicologic conclusion.',
      projectionVersion: 'nonclinical-safety-benchmark/v1',
      projectionRuleIds: signals.map((item) => item.projectionRuleId || ''),
      syntheticRecipe: {
        generator: 'kehrnel-cdisc-synthetic',
        generatorVersion: '2.1.0',
        scenario: 'safety-signal',
        seed: recipe.seed,
        recipeDigest: recipe.recipeDigest,
        modelDigest: 'sha256:c7f38efbcd659593b900250326e5ef30866edc5494bf03050b4a32b4262f234f',
      },
    },
  };
}

export const portfolioBenchmarks = recipes.map(evidence);
