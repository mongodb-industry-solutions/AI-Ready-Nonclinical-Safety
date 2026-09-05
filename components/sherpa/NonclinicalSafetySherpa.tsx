'use client';

import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { DemoSherpaCaptureBridge, DemoSherpaGuide, loadJourneys, saveJourneys } from 'demo-sherpa';
import {
  buildNonclinicalSafetyJourney,
  NONCLINICAL_SAFETY_DEMO_CONTEXT,
  NONCLINICAL_SAFETY_JOURNEY_ID,
  NONCLINICAL_SAFETY_SEED_VERSION,
} from '@/components/sherpa/nonclinicalSafetyJourney';
import { resolveNonclinicalSafetyRouteContext } from '@/components/sherpa/routeContext';

function seedJourneyOnce() {
  const journeys = loadJourneys();
  const existingIndex = journeys.findIndex((journey) => journey.id === NONCLINICAL_SAFETY_JOURNEY_ID);
  if (existingIndex < 0) {
    saveJourneys([...journeys, buildNonclinicalSafetyJourney()]);
    return;
  }

  const existingVersion = Number(journeys[existingIndex]?.seedVersion || 0);
  if (existingVersion >= NONCLINICAL_SAFETY_SEED_VERSION) return;

  const migrated = [...journeys];
  migrated[existingIndex] = buildNonclinicalSafetyJourney();
  saveJourneys(migrated);
}

export default function NonclinicalSafetySherpa() {
  const [ready, setReady] = useState(false);
  const currentUser = useMemo(() => ({
    id: process.env.NEXT_PUBLIC_SHERPA_USER_ID || 'nonclinical-safety-demo-team',
    name: process.env.NEXT_PUBLIC_SHERPA_USER_NAME || 'Nonclinical Safety Demo Team',
    email: process.env.NEXT_PUBLIC_SHERPA_USER_EMAIL || 'nonclinical-safety-demo@mongodb.com',
    roles: ['project-owner'],
  }), []);

  useEffect(() => {
    seedJourneyOnce();
    setReady(true);
  }, []);

  if (!ready || process.env.NEXT_PUBLIC_SHERPA_ENABLED === 'false') return null;

  return <BrowserRouter>
    <DemoSherpaCaptureBridge />
    <DemoSherpaGuide
      enabled
      title="IST Sherpa"
      studioTitle="Nonclinical Safety Journey Studio"
      routeContextResolver={resolveNonclinicalSafetyRouteContext}
      ttsEndpoint={process.env.NEXT_PUBLIC_SHERPA_TTS_ENDPOINT || ''}
      transcribeEndpoint={process.env.NEXT_PUBLIC_SHERPA_TRANSCRIBE_ENDPOINT || ''}
      translateEndpoint={process.env.NEXT_PUBLIC_SHERPA_TRANSLATE_ENDPOINT || ''}
      catalogApiBaseUrl={process.env.NEXT_PUBLIC_SHERPA_CATALOG_API_URL || ''}
      currentUser={currentUser}
      projectOwnerEmails={[currentUser.email]}
      playerLogoSrc="/brand/mongodb-logomark-spring-green.svg"
      assistantLogoSrc="/brand/mongodb-logomark-spring-green.svg"
      defaultPosition={{ right: 18, top: 82 }}
      demoContext={NONCLINICAL_SAFETY_DEMO_CONTEXT}
      overviewSections={[
        { id: 'narration', label: 'Narration' },
        { id: 'step-outline', label: 'Walkthrough' },
        { id: 'why-mongo', label: 'Why MongoDB' },
      ]}
    />
  </BrowserRouter>;
}
