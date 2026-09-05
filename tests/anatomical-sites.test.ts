import { describe, expect, it } from 'vitest';
import { resolveAnatomicalSite } from '../lib/visualization/anatomical-sites';

const observedSites = [
  "PEYER'S PATCH", 'LIVER', 'KIDNEY', 'GLAND, ADRENAL', 'SPLEEN', 'LUNG', 'HEART', 'TONGUE',
  'GLAND, SALIVARY, PAROTID', 'PANCREAS', 'GLAND, THYROID', 'TRACHEA', 'BONE MARROW, FEMUR',
  'BONE MARROW, STERNUM', 'EYE', 'GLAND, HARDERIAN', 'EPIDIDYMIS', 'TESTIS/EPIDIDYMIS',
  'VAGINA', 'MUSCLE, SKELETAL', 'SITE, INJECTION', 'THYMUS',
];

describe('anatomical site registry', () => {
  it('maps every observed solution-library site to a deliberate location', () => {
    expect(observedSites.filter((site) => resolveAnatomicalSite(site).approximate)).toEqual([]);
  });

  it('keeps future unknown sites visible through a bounded fallback', () => {
    const location = resolveAnatomicalSite('NOVEL TISSUE', 3);
    expect(location).toMatchObject({ region: 'other study site', approximate: true });
    expect(location.x).toBeGreaterThanOrEqual(0);
    expect(location.y).toBeLessThanOrEqual(100);
  });
});
