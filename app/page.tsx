import SafetyIntelligenceApp from '@/components/SafetyIntelligenceApp';
import { loadPortfolioEvidence, loadStudyEvidence } from '@/lib/data/study-repository';
import { allLiterature } from '@/lib/data/literature-repository';
import { loadSemanticRuntimeForProfile } from '@/lib/semantics/repository';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const evidence = await loadStudyEvidence();
  const portfolioEvidence = await loadPortfolioEvidence();
  const semantics = await loadSemanticRuntimeForProfile('toxicologist');
  return <SafetyIntelligenceApp evidence={evidence} portfolioEvidence={portfolioEvidence} initialSemantics={semantics} literature={allLiterature()} />;
}
