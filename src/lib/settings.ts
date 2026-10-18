// Device-local settings. Read on the main thread and passed to the import worker.
import type { DriftSettings } from '@/lib/types';

export const DEFAULT_SETTINGS: DriftSettings = { smartTopics: false, titleLookup: false };
const KEY = 'drift-settings';
const listeners = new Set<(s: DriftSettings) => void>();

export function getSettings(): DriftSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(patch: Partial<DriftSettings>): DriftSettings {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep in memory only */ }
  listeners.forEach((l) => l(next));
  return next;
}

export function subscribeSettings(fn: (s: DriftSettings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
