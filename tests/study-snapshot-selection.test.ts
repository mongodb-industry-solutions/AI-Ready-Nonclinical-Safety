import { describe, expect, it } from 'vitest';
import { selectActiveStudyEvidence } from '@/lib/data/study-repository';
import type { StudyEvidence } from '@/lib/contracts';

function version(studyId: string, snapshotId: string, importedAt: string) {
  return {
    study: {
      id: studyId,
      snapshotId,
      title: studyId,
      profile: 'send',
      implementationGuide: 'SENDIG 3.0',
      state: 'published',
      source: 'test',
      sourceRevision: 'test',
      license: 'test',
      recordCount: 0,
      animalCount: 0,
      domains: [],
      domainCounts: {},
    },
    doseGroups: [],
    signals: [],
    labSeries: {},
    provenance: {
      derivedAt: importedAt,
      method: 'test',
      disclaimer: 'test',
      sourceArtifacts: {},
    },
    importedAt: new Date(importedAt),
    importSource: 'kehrnel-export' as const,
  } satisfies StudyEvidence & { importedAt: Date; importSource: 'kehrnel-export' };
}

describe('active study snapshot selection', () => {
  it('uses the explicit pointer even when an older snapshot was imported later', () => {
    const selected = selectActiveStudyEvidence([
      version('A', 'public-v1', '2026-09-05T12:00:00Z'),
      version('A', 'complete-v1', '2026-09-05T11:00:00Z'),
    ], new Map([['A', 'complete-v1']]));
    expect(selected.map((item) => item.study.snapshotId)).toEqual(['complete-v1']);
  });

  it('falls back to the latest import and returns one version per study', () => {
    const selected = selectActiveStudyEvidence([
      version('B', 'v1', '2026-09-05T09:00:00Z'),
      version('A', 'v1', '2026-09-05T10:00:00Z'),
      version('A', 'v2', '2026-09-05T12:00:00Z'),
    ], new Map());
    expect(selected.map((item) => `${item.study.id}:${item.study.snapshotId}`)).toEqual(['A:v2', 'B:v1']);
  });
});
