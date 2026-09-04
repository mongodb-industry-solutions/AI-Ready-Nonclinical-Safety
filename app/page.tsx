import SafetyIntelligenceApp from '@/components/SafetyIntelligenceApp';
import { loadStudyEvidence } from '@/lib/data/study-repository';
import { semanticRuntimeForProfile } from '@/lib/semantics/runtime';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const evidence = await loadStudyEvidence();
  const semantics = semanticRuntimeForProfile('toxicologist');
  return <SafetyIntelligenceApp evidence={evidence} initialSemantics={semantics} />;
}
