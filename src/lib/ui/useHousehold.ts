'use client';
// Real household state for the UI: this device's identity, the household, members,
// what they share with you, what you share with them, alerts and questions about you.
// SSR-safe: nothing runs until mounted. Refreshes on focus and every 60 s while visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Insights } from '@/lib/types';
import type {
  HouseholdMember, Me, QuestionNote, ReceivedSummary, SafetyAlertView, ShareSettings,
} from '@/lib/household';

export interface HouseholdData {
  /** 'unavailable' when this browser has no IndexedDB (household mode off). */
  status: 'loading' | 'ready' | 'unavailable';
  me: Me | null;
  inHousehold: boolean;
  isOwner: boolean;
  /** Everyone, including you, pending joins and (owner only) open invites. */
  members: HouseholdMember[];
  /** What each member shares with you, by member id. */
  summaries: Record<string, ReceivedSummary>;
  /** What you share with each active member, by member id. */
  shareSettings: Record<string, ShareSettings>;
  /** Your own alerts first, then alerts others shared with you. */
  alerts: SafetyAlertView[];
  questions: QuestionNote[];
  /** Last sync error in plain words (data shown is then the cached copy). */
  error: string | null;
  /** The server says you are no longer in this household (removed, or the owner deleted it). */
  gone: boolean;
  refresh(): Promise<void>;
}

export const REFRESH_MS = 60_000;

const EMPTY: Omit<HouseholdData, 'refresh'> = {
  status: 'loading', me: null, inHousehold: false, isOwner: false, members: [], summaries: {}, shareSettings: {}, alerts: [], questions: [], error: null, gone: false,
};

function message(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Could not update the household.';
}

/**
 * Loads household state. `insights` are your real Insights (null on sample data);
 * they are used to re-check your own safety alerts.
 */
export function useHouseholdData(insights: Insights | null): HouseholdData {
  const [state, setState] = useState(EMPTY);
  const insightsRef = useRef(insights);
  insightsRef.current = insights;
  const inflight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const hh = await import('@/lib/household');
    const me = await hh.getMe();
    if (!me) {
      if (mounted.current) setState({ ...EMPTY, status: 'unavailable' });
      return;
    }
    if (!me.household) {
      let alerts: SafetyAlertView[] = [];
      try { alerts = (await hh.getSafetyAlerts(insightsRef.current)).filter((a) => a.about === 'me'); } catch { /* none */ }
      if (mounted.current) setState({ ...EMPTY, status: 'ready', me, alerts });
      return;
    }
    let error: string | null = null;
    const safe = async <T,>(f: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await f(); } catch (e) { error ??= message(e); return fallback; }
    };
    let gone = false;
    const members = await hh.listMembers().catch((e: unknown) => {
      const code = (e as { code?: string })?.code;
      if (code === 'not_member' || code === 'household_gone') gone = true; else error ??= message(e);
      return [] as HouseholdMember[];
    });
    if (gone) {
      if (mounted.current) setState({ ...EMPTY, status: 'ready', me, inHousehold: true, isOwner: me.household.isOwner, gone: true });
      return;
    }
    // listMembers may notice that the household is gone (removed, deleted by the owner).
    const me2 = (await hh.getMe()) ?? me;
    if (!me2.household) {
      if (mounted.current) setState({ ...EMPTY, status: 'ready', me: me2 });
      return;
    }
    const received = await safe(() => hh.fetchMemberSummaries(), [] as ReceivedSummary[]);
    const alerts = await safe(() => hh.getSafetyAlerts(insightsRef.current), [] as SafetyAlertView[]);
    const questions = await safe(() => hh.listQuestionsAboutMe(), [] as QuestionNote[]);
    const shareSettings: Record<string, ShareSettings> = {};
    for (const m of members) {
      if (m.isMe || m.status === 'invited') continue;
      shareSettings[m.memberId] = await safe(() => hh.getShareSettings(m.memberId), hh.defaultShareSettings());
    }
    const summaries: Record<string, ReceivedSummary> = {};
    for (const r of received) summaries[r.memberId] = r;
    alerts.sort((a, b) => (a.about === 'me' ? 0 : 1) - (b.about === 'me' ? 0 : 1) || b.detectedAt.localeCompare(a.detectedAt));
    if (!mounted.current) return;
    setState({
      status: 'ready', me: me2, inHousehold: true, isOwner: me2.household.isOwner,
      members, summaries, shareSettings, alerts, questions, error, gone: false,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const p = load().catch((e) => {
      if (mounted.current) setState((s) => ({ ...s, status: s.status === 'loading' ? 'ready' : s.status, error: message(e) }));
    }).finally(() => { inflight.current = null; });
    inflight.current = p;
    return p;
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_MS);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}

/** First name for UI copy ("Maya, 15" → "Maya"). */
export function firstName(name: string | undefined | null): string {
  const n = (name ?? '').trim().split(/[ ,]/)[0];
  return n || 'They';
}

/** Avatar class and initial for a real member, keeping the wireframe colours. */
export function avatarFor(m: { role?: string | null; displayName: string; isMe?: boolean; status?: string }): { cls: string; initial: string; color: string } {
  if (m.isMe) return { cls: 'av-you', initial: 'You', color: 'var(--t1)' };
  const initial = (m.displayName.trim()[0] ?? '?').toUpperCase();
  if (m.status === 'invited' || m.status === 'pending') return { cls: 'av-leo', initial, color: 'var(--muted-line)' };
  if (m.role === 'teen') return { cls: 'av-maya', initial, color: 'var(--amber)' };
  return { cls: 'av-sam', initial, color: 'var(--accent)' };
}

export const ROLE_LABEL: Record<string, string> = { owner: 'Owner', adult: 'Adult', teen: 'Teen' };
