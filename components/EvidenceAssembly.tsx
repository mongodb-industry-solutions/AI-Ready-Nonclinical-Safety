'use client';

import { ArrowUpRight, Link2 } from 'lucide-react';
import type { SafetySignal, StudyEvidence } from '@/lib/contracts';

export type EvidenceDomain = 'MI' | 'DM' | 'TX' | 'LB' | 'MA' | 'OM' | 'BW' | 'BG' | 'CL' | 'EX' | 'PC' | 'PP';
type EvidenceAssemblyDomain = 'MI' | 'DM' | 'TX' | 'LB';

const domainMeaning: Record<EvidenceAssemblyDomain, { title: string; contribution: string }> = {
  MI: { title: 'Microscopic findings', contribution: 'organ, morphology & severity' },
  DM: { title: 'Demographics', contribution: 'subject identity & study group' },
  TX: { title: 'Trial sets', contribution: 'dose, vehicle & exposure design' },
  LB: { title: 'Laboratory tests', contribution: 'longitudinal biological context' },
};

export default function EvidenceAssembly({ evidence, signal, onInspect }: { evidence: StudyEvidence; signal: SafetySignal; onInspect: (domain: EvidenceDomain) => void }) {
  const domains: Array<{ code: EvidenceAssemblyDomain; value: string }> = [
    { code: 'MI', value: `${signal.affectedAnimals} affected animals` },
    { code: 'DM', value: `${evidence.study.animalCount} study animals` },
    { code: 'TX', value: `${evidence.doseGroups.length} dose groups` },
    { code: 'LB', value: signal.correlatedLab ? `${signal.correlatedLab} test` : 'No asserted correlate' },
  ];

  return <section className="evidence-assembly" aria-label="Evidence assembly from SEND source domains">
    <header>
      <div><span className="panel-kicker">Evidence assembly</span><b>How this evidence view is built</b><small>Each node is a governed SEND source domain. Select one to inspect its canonical records and lineage.</small></div>
      <span className="evidence-join"><Link2 size={11} /> joined by study · subject · group</span>
    </header>
    <div className="evidence-path">
      {domains.map((domain, index) => <div className="evidence-path-step" key={domain.code}>
        <button type="button" data-domain={domain.code} onClick={() => onInspect(domain.code)} aria-label={`Inspect ${domain.code} ${domainMeaning[domain.code].title} source records`}>
          <span className="domain-tag">{domain.code}</span>
          <span className="domain-copy"><b>{domainMeaning[domain.code].title}</b><strong>{domain.value}</strong><small>{domainMeaning[domain.code].contribution}</small></span>
          <ArrowUpRight className="domain-open" size={13} />
        </button>
        {index < domains.length - 1 && <i aria-hidden="true" />}
      </div>)}
    </div>
  </section>;
}
