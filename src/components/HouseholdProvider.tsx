'use client';
// Household state for every screen:
//  - `useHouseholdLive()`: the real household (src/lib/household), refreshed on focus and every 60 s.
//  - `useHousehold()`: the in-memory sample people used by the "Preview" screens.
// Also publishes this device's summaries after each import or recompute and on app open.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MEMBERS, SHARE,
  type MemberKey, type ShareFlags, type ShareFlagsWithSensitive, type Viewer,
} from '@/lib/sample/household';
import { useDrift } from '@/lib/pipeline/useDrift';
import { useHouseholdData, type HouseholdData } from '@/lib/ui/useHousehold';
import type { Insights } from '@/lib/types';

interface SampleState {
  share: Record<Viewer, ShareFlagsWithSensitive>;
  setShare(viewer: Viewer, cat: keyof ShareFlagsWithSensitive, on: boolean): void;
  memberShared: Record<MemberKey, ShareFlags>;
  setMemberShared(key: MemberKey, flags: ShareFlags): void;
}

export interface LiveHousehold extends HouseholdData {
  /** Your real Insights, or null while on sample data (never shared). */
  myInsights: Insights | null;
  /** Publish your summaries now (after a settings change that affects everyone). Errors are swallowed. */
  publishNow(): Promise<void>;
}

const SampleCtx = createContext<SampleState | null>(null);
const LiveCtx = createContext<LiveHousehold | null>(null);

/** Re-publish at least this often while the app is open (releases delayed safety alerts). */
const REPUBLISH_MS = 6 * 60 * 60 * 1000;
const DEBOUNCE_MS = 1500;

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [share, setShareState] = useState(() => ({ sam: { ...SHARE.sam }, maya: { ...SHARE.maya } }));
  const [memberShared, setMemberSharedState] = useState<Record<MemberKey, ShareFlags>>(() => ({
    you: { ...MEMBERS.you.shared }, sam: { ...MEMBERS.sam.shared }, maya: { ...MEMBERS.maya.shared },
  }));

  const sample = useMemo<SampleState>(() => ({
    share,
    setShare: (viewer, cat, on) => setShareState((s) => ({ ...s, [viewer]: { ...s[viewer], [cat]: on } })),
    memberShared,
    setMemberShared: (key, flags) => setMemberSharedState((s) => ({ ...s, [key]: { ...flags } })),
  }), [share, memberShared]);

  const drift = useDrift();
  const myInsights = drift.status === 'ready' && !drift.isSample ? drift.insights : null;
  const data = useHouseholdData(myInsights);
  const publish = usePublisher(data, myInsights);

  const live = useMemo<LiveHousehold>(() => ({ ...data, myInsights, publishNow: publish }), [data, myInsights, publish]);

  return (
    <SampleCtx.Provider value={sample}>
      <LiveCtx.Provider value={live}>{children}</LiveCtx.Provider>
    </SampleCtx.Provider>
  );
}

/**
 * Publishes this device's encrypted summaries (debounced) whenever the Insights,
 * the household or its active members change, and every few hours. Errors are
 * not fatal: the next trigger tries again.
 */
function usePublisher(data: HouseholdData, insights: Insights | null) {
  const lastKey = useRef('');
  const insightsRef = useRef(insights);
  insightsRef.current = insights;
  const refreshRef = useRef(data.refresh);
  refreshRef.current = data.refresh;
  const [tick, setTick] = useState(0);

  const householdId = data.me?.household?.id ?? '';
  const active = data.members.filter((m) => !m.isMe && m.status === 'active').map((m) => m.memberId).sort().join(',');
  const key = householdId && insights ? `${householdId}|${insights.generatedAt}|${active}|${tick}` : '';

  const publish = useMemo(() => async () => {
    const ins = insightsRef.current;
    if (!ins) return;
    try {
      const { publishSummaries } = await import('@/lib/household');
      const r = await publishSummaries(ins);
      if (r.published.length || r.removed.length) void refreshRef.current();
    } catch { /* offline or not in a household: try again next time */ }
  }, []);

  useEffect(() => {
    if (!key || key === lastKey.current) return;
    const t = window.setTimeout(() => { lastKey.current = key; void publish(); }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [key, publish]);

  useEffect(() => {
    if (!householdId) return;
    const id = window.setInterval(() => setTick((n) => n + 1), REPUBLISH_MS);
    return () => window.clearInterval(id);
  }, [householdId]);

  return publish;
}

/** Sample people for the Preview screens. */
export function useHousehold(): SampleState {
  const v = useContext(SampleCtx);
  if (!v) throw new Error('useHousehold must be used inside HouseholdProvider');
  return v;
}

/** The real household on this device. */
export function useHouseholdLive(): LiveHousehold {
  const v = useContext(LiveCtx);
  if (!v) throw new Error('useHouseholdLive must be used inside HouseholdProvider');
  return v;
}

/** Number of safety alerts to badge on the Household tab (real alerts only). */
export function useHouseholdAlertCount(): number {
  const v = useContext(LiveCtx);
  return v?.alerts.length ?? 0;
}
