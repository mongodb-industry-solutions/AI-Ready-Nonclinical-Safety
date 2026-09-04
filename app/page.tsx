import SafetyIntelligenceApp from '@/components/SafetyIntelligenceApp';
import { loadStudyEvidence } from '@/lib/data/kehrnel';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const evidence = await loadStudyEvidence();
  return <SafetyIntelligenceApp evidence={evidence} />;
}
