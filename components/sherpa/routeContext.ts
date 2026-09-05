const pageGuidance = {
  title: 'AI-Ready Nonclinical Safety',
  talkTrack: [
    'Begin with the scientific question and the selected SEND study.',
    'Use the signal workspace to narrow the evidence before opening the investigator.',
    'Treat AI output as a cited hypothesis for expert review, never as an autonomous conclusion.',
  ],
  journeySteps: [
    'Orient the audience to the nonclinical safety decision.',
    'Inspect standardized evidence and triage one signal.',
    'Open the governed investigation, portfolio, semantic, architecture, and audit views.',
  ],
  whyMongo: [
    'MongoDB connects canonical SEND records, rebuildable projections, semantic contracts, retrieval telemetry, and human review state in one traceable operating model.',
  ],
};

export function resolveNonclinicalSafetyRouteContext(pathname = '/') {
  return { ...pageGuidance, pathname: String(pathname || '/') };
}
