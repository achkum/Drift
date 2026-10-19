// Shared helpers for the household PREVIEW screens, which use made-up people from src/lib/sample/household.ts.
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { SHARE, type CmpRowData, type ShareCategory, type ShareFlagsWithSensitive, type Viewer } from '@/lib/sample/household';
import { T } from './kit';
import { useTheme, type Colors } from './theme';

/** Sample data names colours as CSS variables; map them to theme tokens. */
export function tok(c: Colors, v: string): string {
  const map: Record<string, string> = {
    'var(--accent)': c.accent, 'var(--t1)': c.t1, 'var(--muted-line)': c.mutedLine, 'var(--served)': c.served, 'var(--amber)': c.amber,
  };
  return map[v] ?? v;
}

// ── What you share (sample, per session) ────────────────

let share: Record<Viewer, ShareFlagsWithSensitive> = { sam: { ...SHARE.sam }, maya: { ...SHARE.maya } };
const listeners = new Set<() => void>();

export function setShare(who: Viewer, cat: ShareCategory | 'sens', on: boolean) {
  share = { ...share, [who]: { ...share[who], [cat]: on } };
  listeners.forEach((l) => l());
}

export function useShare(): Record<Viewer, ShareFlagsWithSensitive> {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => share,
    () => share,
  );
}

export function CmpRow({ r }: { r: CmpRowData }) {
  const { c } = useTheme();
  const w = `${Math.min(100, (r.v / 35) * 100)}%` as `${number}%`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${r.n}${r.s ? `, ${r.s}` : ''}: ${r.v}%`}>
      <View style={{ width: 116 }}>
        <T style={{ fontSize: 14, lineHeight: 17 }}>{r.n}</T>
        {r.s ? <T v="tiny" style={{ fontSize: 12, lineHeight: 15 }}>{r.s}</T> : null}
      </View>
      <View style={{ flex: 1, height: 10, borderRadius: 999, backgroundColor: c.surface, overflow: 'hidden' }}>
        <View style={r.k === 'r'
          ? { width: w, height: '100%', borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.mutedLine }
          : { width: w, height: '100%', borderRadius: 999, backgroundColor: tok(c, r.c) }} />
      </View>
      <T w={700} style={{ width: 40, textAlign: 'right', fontSize: 14 }}>{r.v}%</T>
    </View>
  );
}
