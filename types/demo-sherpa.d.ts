declare module 'demo-sherpa' {
  import type { ComponentType } from 'react';

  export const DemoSherpaCaptureBridge: ComponentType<Record<string, never>>;
  export const DemoSherpaGuide: ComponentType<Record<string, unknown>>;
  export function loadJourneys(): Array<Record<string, unknown> & { id?: string }>;
  export function saveJourneys(journeys: Array<Record<string, unknown>>): void;
}
