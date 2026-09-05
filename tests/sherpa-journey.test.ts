import { describe, expect, it } from 'vitest';
import {
  buildNonclinicalSafetyJourney,
  NONCLINICAL_SAFETY_DEMO_CONTEXT,
  NONCLINICAL_SAFETY_JOURNEY_ID,
  NONCLINICAL_SAFETY_SEED_VERSION,
} from '../components/sherpa/nonclinicalSafetyJourney';

describe('the seeded Demo Sherpa journey', () => {
  it('covers the complete product story in order', () => {
    const journey = buildNonclinicalSafetyJourney();

    expect(journey.id).toBe(NONCLINICAL_SAFETY_JOURNEY_ID);
    expect(journey.seedVersion).toBe(NONCLINICAL_SAFETY_SEED_VERSION);
    expect(journey.context.demoSlug).toBe(NONCLINICAL_SAFETY_DEMO_CONTEXT.demoSlug);
    expect(journey.steps.map((step) => step.id)).toEqual([
      'ncs-orientation',
      'ncs-evidence',
      'ncs-triage',
      'ncs-investigation',
      'ncs-portfolio',
      'ncs-semantics',
      'ncs-architecture',
      'ncs-trust',
    ]);
  });

  it('uses segment narration, explicit pauses, and checkpoint-gated actions', () => {
    const journey = buildNonclinicalSafetyJourney();

    for (const step of journey.steps) {
      expect(step.playbackMode).toBe('synthesized');
      expect(step.path).toBe('');
      expect(step.narrationSegments.some((segment) => segment.type === 'speech')).toBe(true);
      expect(step.narrationSegments.some((segment) => segment.type === 'silence')).toBe(true);
      expect(step.preconditions[0].condition.selector).toBe('[data-sherpa-state="app-ready"]');
      expect(step.events.length).toBeGreaterThan(0);
      expect(step.events.every((event) => event.critical && event.failureBehavior === 'pause')).toBe(true);
      expect(step.events.every((event) => event.postCondition.type === 'element-visible')).toBe(true);
    }
  });
});
