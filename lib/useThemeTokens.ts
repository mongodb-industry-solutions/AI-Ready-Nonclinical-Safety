'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Canvas-rendered surfaces (Recharts, React Flow) cannot read CSS custom
 * properties, so they resolve the active theme's role tokens at runtime and
 * re-resolve whenever the theme changes.
 */
export interface ThemeTokens {
  grid: string;
  axis: string;
  tick: string;
  label: string;
  accent: string;
  accentDeep: string;
  control: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  series: string[];
  tooltip: { background: string; border: string; borderRadius: number; fontSize: number; color: string };
}

const FALLBACK = '#000000';

function read(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim() || FALLBACK;
}

function resolve(): ThemeTokens {
  const styles = getComputedStyle(document.documentElement);
  const tick = read(styles, '--ink-56');
  const surface = read(styles, '--surface-8');
  const border = read(styles, '--line-25');
  return {
    grid: read(styles, '--surface-16'),
    axis: read(styles, '--line-25'),
    tick,
    label: read(styles, '--ink-49'),
    accent: read(styles, '--green-45'),
    accentDeep: read(styles, '--green-27'),
    control: read(styles, '--ink-40'),
    surface,
    surfaceRaised: read(styles, '--surface-12'),
    border,
    text: read(styles, '--ink-91'),
    series: [
      read(styles, '--ink-49'), // control — deliberately neutral
      read(styles, '--sky-50'),
      read(styles, '--green-45'),
      read(styles, '--amber-50'),
      read(styles, '--mauve-70'),
      read(styles, '--green-72'),
    ],
    tooltip: {
      background: surface,
      border: `1px solid ${border}`,
      borderRadius: 10,
      fontSize: 12,
      color: read(styles, '--ink-91'),
    },
  };
}

export function useThemeTokens(): ThemeTokens | null {
  // Null on the server and first paint, so charts never render with the wrong theme.
  const [tokens, setTokens] = useState<ThemeTokens | null>(null);
  const refresh = useCallback(() => setTokens(resolve()), []);

  useEffect(() => {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', refresh);
    return () => { observer.disconnect(); media.removeEventListener('change', refresh); };
  }, [refresh]);

  return tokens;
}
