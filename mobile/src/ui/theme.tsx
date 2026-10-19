// Tokens from src/app/globals.css, light and dark, plus the theme preference (light/dark/system).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { kvGet, kvSet } from './kv';

export const light = {
  outer: '#E7E7E2', bg: '#FFFFFF', surface: '#F4F4F1', line: '#E4E4DF',
  t1: '#141414', t2: '#5C5C57', t3: '#85857F',
  btn: '#141414', btnT: '#FFFFFF',
  accent: '#0F766E', accentT: '#0B5D55', accentS: '#E3F1EE', served: '#9FCFC6',
  amber: '#8A4B0F', amberS: '#FBF1E6', red: '#B42318',
  swOff: '#CFCFCA', mutedLine: '#9A9A94', overlay: 'rgba(0,0,0,0.4)',
};
export type Colors = typeof light;

export const dark: Colors = {
  outer: '#060707', bg: '#111312', surface: '#1C1F1E', line: '#2B2F2D',
  t1: '#EEEFEC', t2: '#A6ABA8', t3: '#7C817E',
  btn: '#EEEFEC', btnT: '#111312',
  accent: '#4FB3A2', accentT: '#86D3C6', accentS: '#173431', served: '#2F6B62',
  amber: '#F2B66C', amberS: '#3A2B18', red: '#F2867B',
  swOff: '#3C413E', mutedLine: '#6E7370', overlay: 'rgba(0,0,0,0.6)',
};

export type ThemePref = 'light' | 'dark' | 'system';
const THEME_KEY = 'drift.theme';
const ONBOARDED_KEY = 'drift.onboarded';

function readPref(): ThemePref {
  const v = kvGet(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

interface ThemeCtx { c: Colors; isDark: boolean; pref: ThemePref; setPref(p: ThemePref): void }
const Ctx = createContext<ThemeCtx>({ c: light, isDark: false, pref: 'system', setPref: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const setPref = useCallback((p: ThemePref) => {
    kvSet(THEME_KEY, p === 'system' ? null : p);
    setPrefState(p);
  }, []);
  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';
  const value = useMemo(() => ({ c: isDark ? dark : light, isDark, pref, setPref }), [isDark, pref, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx { return useContext(Ctx); }

export function isOnboarded(): boolean { return kvGet(ONBOARDED_KEY) === '1'; }
export function setOnboarded(done: boolean): void { kvSet(ONBOARDED_KEY, done ? '1' : null); }

export const FONT = { 400: 'DMSans_400Regular', 500: 'DMSans_500Medium', 700: 'DMSans_700Bold' } as const;
