'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemeChoice = 'dark' | 'light' | 'system';

const options: Array<{ id: ThemeChoice; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'Match system', icon: Monitor },
];

export const THEME_STORAGE_KEY = 'nonclinical-safety-theme';

/**
 * Applies the choice as a `data-theme` attribute. `system` removes the
 * attribute so the `prefers-color-scheme` block in globals.css takes over.
 */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice | null;
    if (stored === 'dark' || stored === 'light' || stored === 'system') setChoice(stored);
  }, []);

  const change = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={choice === id ? 'active' : ''}
          aria-pressed={choice === id}
          aria-label={label}
          title={label}
          onClick={() => change(id)}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
