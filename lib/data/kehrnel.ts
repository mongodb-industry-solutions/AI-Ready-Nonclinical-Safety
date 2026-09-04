import type { StudyEvidence } from '@/lib/contracts';
import { demoEvidence } from '@/lib/data/demo';

type KehrnelConfig = { baseUrl: string; environmentId: string; apiKey?: string };

function config(): KehrnelConfig | null {
  const baseUrl = process.env.KEHRNEL_API_URL?.replace(/\/$/, '');
  const environmentId = process.env.KEHRNEL_ENVIRONMENT_ID;
  if (!baseUrl || !environmentId) return null;
  return { baseUrl, environmentId, apiKey: process.env.KEHRNEL_API_KEY };
}

export function configuredForKehrnel(): boolean {
  return process.env.SAFETY_DATA_MODE === 'kehrnel' && config() !== null;
}

export async function runCdiscOp(op: string, payload: Record<string, unknown>) {
  const current = config();
  if (!current) throw new Error('Kehrnel is not configured');
  const response = await fetch(
    `${current.baseUrl}/environments/${encodeURIComponent(current.environmentId)}/activations/cdisc/ops/${encodeURIComponent(op)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(current.apiKey ? { authorization: `Bearer ${current.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || body?.message || `Kehrnel operation ${op} failed`);
  return body?.result ?? body;
}

export async function loadStudyEvidence(studyId?: string): Promise<StudyEvidence> {
  if (!configuredForKehrnel()) return demoEvidence;

  // Phase 1 intentionally uses Kehrnel for canonical identity and scope while
  // the visual read model is deterministic. Phase 2 replaces this merge with
  // cdisc_get_safety_signal once portfolio materializations are available.
  const summary = await runCdiscOp('cdisc_snapshot_summary', {
    studyId: studyId || demoEvidence.study.id,
    snapshotId: demoEvidence.study.snapshotId,
  });
  return {
    ...demoEvidence,
    study: {
      ...demoEvidence.study,
      id: summary?.snapshot?.studyId || demoEvidence.study.id,
      snapshotId: summary?.snapshot?.snapshotId || demoEvidence.study.snapshotId,
      state: summary?.snapshot?.state || demoEvidence.study.state,
      recordCount: summary?.summary?.recordCount ?? demoEvidence.study.recordCount,
      domains: summary?.summary?.domains ?? demoEvidence.study.domains,
    },
  };
}
