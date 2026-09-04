import SafetyIntelligenceApp from '@/components/SafetyIntelligenceApp';
import { loadStudyEvidence } from '@/lib/data/study-repository';
import { loadSemanticRuntimeForProfile } from '@/lib/semantics/repository';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const evidence = await loadStudyEvidence();
  const semantics = await loadSemanticRuntimeForProfile('toxicologist');
  return <SafetyIntelligenceApp evidence={evidence} initialSemantics={semantics} />;
}
