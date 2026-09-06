export interface AnatomicalSitePosition {
  region: string;
  x: number;
  y: number;
  approximate: boolean;
}

const siteRules: Array<{ match: RegExp; region: string; x: number; y: number }> = [
  { match: /HARDERIAN/, region: 'orbital gland', x: 80, y: 19 },
  { match: /^EYE/, region: 'eye', x: 84, y: 22 },
  { match: /^TONGUE/, region: 'oral cavity', x: 88, y: 30 },
  { match: /SALIVARY|PAROTID/, region: 'salivary gland', x: 74, y: 33 },
  { match: /THYROID/, region: 'thyroid gland', x: 68, y: 38 },
  { match: /^TRACHEA/, region: 'trachea', x: 71, y: 42 },
  { match: /^THYMUS/, region: 'thymus', x: 63, y: 43 },
  { match: /^LUNG/, region: 'lung', x: 57, y: 47 },
  { match: /^HEART/, region: 'heart', x: 65, y: 50 },
  { match: /STERNUM/, region: 'sternal marrow', x: 60, y: 53 },
  { match: /SITE,? INJECTION/, region: 'injection site', x: 31, y: 52 },
  { match: /^LIVER/, region: 'liver', x: 52, y: 57 },
  { match: /^SPLEEN/, region: 'spleen', x: 41, y: 59 },
  { match: /ADRENAL/, region: 'adrenal gland', x: 60, y: 60 },
  { match: /^KIDNEY/, region: 'kidney', x: 55, y: 64 },
  { match: /^PANCREAS/, region: 'pancreas', x: 48, y: 64 },
  { match: /PEYER/, region: "Peyer's patch", x: 54, y: 69 },
  { match: /MAMMARY/, region: 'mammary gland', x: 40, y: 70 },
  { match: /MUSCLE,? SKELETAL/, region: 'skeletal muscle', x: 34, y: 74 },
  { match: /^VAGINA/, region: 'reproductive tract', x: 57, y: 78 },
  { match: /^TESTIS\/EPIDIDYMIS/, region: 'male reproductive tract', x: 43, y: 81 },
  { match: /^EPIDIDYMIS/, region: 'epididymis', x: 51, y: 83 },
  { match: /FEMUR/, region: 'femoral marrow', x: 62, y: 88 },
];

const fallbackPositions = [
  { x: 19, y: 25 }, { x: 18, y: 36 }, { x: 17, y: 47 }, { x: 18, y: 63 },
  { x: 21, y: 77 }, { x: 76, y: 52 }, { x: 75, y: 65 }, { x: 72, y: 76 },
];

export function resolveAnatomicalSite(organ: string, fallbackIndex = 0): AnatomicalSitePosition {
  const normalized = organ.trim().toUpperCase();
  const matched = siteRules.find((rule) => rule.match.test(normalized));
  if (matched) return { region: matched.region, x: matched.x, y: matched.y, approximate: false };
  const fallback = fallbackPositions[fallbackIndex % fallbackPositions.length];
  return { region: 'other study site', ...fallback, approximate: true };
}
