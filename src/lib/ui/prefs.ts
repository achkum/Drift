'use client';
// Local, per-device UI preferences: theme and onboarding completion.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

import { AUDIENCE_KEY, ONBOARDED_KEY, THEME_KEY } from './boot';

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = () => l();
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* storage blocked: preference lasts for this page only */ }
}

// ── Theme ───────────────────────────────────────────────

export function getThemePref(): ThemePref {
  const v = read(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function systemIsDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (systemIsDark() ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
}

export function setThemePref(pref: ThemePref) {
  write(THEME_KEY, pref === 'system' ? null : pref);
  applyTheme(pref);
  emit();
}

function subscribeSystem(l: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', l);
  return () => mq.removeEventListener('change', l);
}

/** Whether the device prefers dark. false during server render. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
}

/** null during server render and hydration. */
export function useThemePref(): ThemePref | null {
  return useSyncExternalStore(subscribe, getThemePref, () => null);
}

// ── Onboarding ──────────────────────────────────────────

export function isOnboarded(): boolean {
  return read(ONBOARDED_KEY) === '1';
}

export function setOnboarded(done: boolean) {
  write(ONBOARDED_KEY, done ? '1' : null);
  if (done) document.documentElement.setAttribute('data-onboarded', '');
  else document.documentElement.removeAttribute('data-onboarded');
  emit();
}

/** null during server render and hydration. */
export function useOnboarded(): boolean | null {
  return useSyncExternalStore(subscribe, isOnboarded, () => null);
}

// ── Audience (who it's for) ─────────────────────────────

export function getAudience(): 'me' | 'household' {
  return read(AUDIENCE_KEY) === 'me' ? 'me' : 'household';
}

export function setAudience(v: 'me' | 'household') {
  write(AUDIENCE_KEY, v);
  emit();
}

export function useAudience(): 'me' | 'household' | null {
  return useSyncExternalStore(subscribe, getAudience, () => null);
}
