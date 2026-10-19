// Served vs chosen labelling (see the product table in the proposal).
import type { DriftEvent, FollowRecord, Origin } from '@/lib/types';
import { contentTokens, nameKey, tokensMatch, urlKey } from './text';

export const SEARCH_WINDOW_MS = 30 * 60 * 1000;
/** The first watch this soon after a search is almost always one of its results, even with no shared words. */
export const SEARCH_CLICK_MS = 5 * 60 * 1000;
export const RETURN_DAYS = 6;
/** A watch starts a session when nothing was watched in the gap before it; only those count as a deliberate return. */
export const SESSION_GAP_MS = 10 * 60 * 1000;
export const RETURN_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface OriginLabel {
  origin: Origin;
  originReason: string;
}

const ENGAGED: Record<string, string> = {
  like: 'you liked it',
  save: 'you saved it',
  share: 'you shared it',
  comment: 'you commented on it',
};

export interface FollowIndex {
  names: Set<string>;
  urls: Set<string>;
}

export function buildFollowIndex(follows: FollowRecord[]): FollowIndex {
  const names = new Set<string>();
  const urls = new Set<string>();
  for (const f of follows) {
    const n = nameKey(f.name);
    if (n) names.add(n);
    const u = urlKey(f.url);
    if (u) urls.add(u);
  }
  return { names, urls };
}

export function isFollowed(ev: Pick<DriftEvent, 'channel'>, idx: FollowIndex): boolean {
  const c = ev.channel;
  if (!c) return false;
  const n = nameKey(c.name);
  if (n && idx.names.has(n)) return true;
  const u = urlKey(c.url);
  return Boolean(u && idx.urls.has(u));
}

/** Stable key for "the same channel" across events. */
export function channelKey(ev: Pick<DriftEvent, 'channel'>): string | undefined {
  return urlKey(ev.channel?.url) ?? nameKey(ev.channel?.name);
}

function lowerBound(arr: number[], x: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function shorten(q: string): string {
  const t = q.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 39).trimEnd() + '…' : t;
}

/**
 * Label each event. `events` and `times` (epoch ms) must be sorted oldest first.
 * Precedence: pushed > engaged > search > followed > after a search > came back > served.
 */
export function labelOrigins(events: DriftEvent[], times: number[], follows: FollowRecord[]): OriginLabel[] {
  const followIdx = buildFollowIndex(follows);
  const out: OriginLabel[] = new Array(events.length);
  const recentSearches: { time: number; tokens: string[]; query: string }[] = [];
  const channelDays = new Map<string, number[]>();
  let lastWatch = -Infinity;
  let lastSearch = -Infinity;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const t = times[i];

    if (ev.kind === 'ad' || ev.fromAds) {
      out[i] = { origin: 'pushed', originReason: ev.kind === 'ad' ? 'an ad' : 'from ads' };
      continue;
    }
    if (ENGAGED[ev.kind]) {
      out[i] = { origin: 'engaged', originReason: ENGAGED[ev.kind] };
      continue;
    }
    if (ev.kind === 'search') {
      out[i] = { origin: 'chosen', originReason: 'you searched for it' };
      const q = ev.query ?? ev.title ?? '';
      const tokens = contentTokens(q);
      if (tokens.length) recentSearches.push({ time: t, tokens, query: q });
      lastSearch = t;
      continue;
    }

    // Watch. Autoplay and feed scrolling chain watches together; a watch with a gap before it was opened on purpose more often.
    const prevWatch = lastWatch;
    const startsSession = t - lastWatch > SESSION_GAP_MS;
    lastWatch = t;
    let label: OriginLabel | undefined;
    if (isFollowed(ev, followIdx)) {
      label = {
        origin: 'chosen',
        originReason: ev.platform === 'youtube' ? 'subscribed channel' : 'an account you follow',
      };
    }

    if (!label && t >= lastSearch && t - lastSearch <= SEARCH_CLICK_MS && prevWatch < lastSearch) {
      const q = recentSearches.length ? recentSearches[recentSearches.length - 1].query : '';
      label = { origin: 'chosen', originReason: q ? `opened right after a search for '${shorten(q)}'` : 'opened right after a search' };
    }

    if (!label && recentSearches.length) {
      // Drop searches older than the window.
      let drop = 0;
      while (drop < recentSearches.length && t - recentSearches[drop].time > SEARCH_WINDOW_MS) drop++;
      if (drop) recentSearches.splice(0, drop);
      if (recentSearches.length) {
        const words = contentTokens(`${ev.title ?? ''} ${ev.channel?.name ?? ''}`);
        if (words.length) {
          for (let s = recentSearches.length - 1; s >= 0 && !label; s--) {
            const search = recentSearches[s];
            if (search.time > t) continue;
            if (search.tokens.some((a) => words.some((b) => tokensMatch(a, b)))) {
              label = { origin: 'chosen', originReason: `followed a search for '${shorten(search.query)}'` };
            }
          }
        }
      }
    }

    const ck = channelKey(ev);
    if (ck && Number.isFinite(t)) {
      const day = Math.floor(t / DAY_MS);
      let days = channelDays.get(ck);
      if (!days) channelDays.set(ck, (days = []));
      if (days[days.length - 1] !== day) days.push(day);
      if (!label && startsSession) {
        const n = days.length - lowerBound(days, day - (RETURN_WINDOW_DAYS - 1));
        if (n >= RETURN_DAYS) {
          label = { origin: 'chosen', originReason: `came back to this channel on ${n} days in a month` };
        }
      }
    }

    out[i] = label ?? { origin: 'served', originReason: 'shown by the feed' };
  }
  return out;
}
