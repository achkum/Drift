// Drift metrics: builds the Insights object the UI renders directly.
import type {
  AdvertiserRecord, ClassifiedEvent, FollowRecord, Insights, Platform, PlatformInterestList,
  TopicDelta, TopicDetail, TopicId, TopicSource, TurningPoint,
} from '@/lib/types';
import { analyseAds } from './ads';
import { matchTopic } from './classifier';
import { buildFollowIndex, channelKey, isFollowed } from './origin';
import { contentTokens, tokenize, tokensMatch } from './text';
import { OTHER, TOPIC_KEYWORDS, UNKNOWN, topicLabel, topicSensitive } from './topics';

const DAY_MS = 86_400_000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PLATFORM_LABEL: Record<Platform, string> = { youtube: 'YouTube', google_search: 'Google', tiktok: 'TikTok', instagram: 'Instagram' };

export const MONTHLY_TOP = 8;
export const COMPARE_MONTHS_BACK = 6;
export const CHOSEN_WINDOW_DAYS = 30;
const MIN_MONTH_ITEMS = 5;

export interface InsightsInput {
  /** Classified events, oldest first. */
  events: ClassifiedEvent[];
  /** Epoch ms per event, same order. */
  times: number[];
  follows: FollowRecord[];
  interests: PlatformInterestList[];
  advertisers: AdvertiserRecord[];
  now?: Date;
}

// ── small helpers ──────────────────────────────────────────────────

const monthNum = (ms: number) => { const d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const monthStr = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** 'YYYY-MM' -> 'July'. */
export const monthName = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? m;
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, one: string, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const isChosen = (e: ClassifiedEvent) => e.origin === 'chosen' || e.origin === 'engaged';
const isViewing = (e: ClassifiedEvent) => e.kind === 'watch' && e.topic !== UNKNOWN;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function topEntry<K>(m: Map<K, number>): [K, number] | undefined {
  let best: [K, number] | undefined;
  for (const e of m) if (!best || e[1] > best[1]) best = e;
  return best;
}

function inc<K>(m: Map<K, number>, k: K, by = 1) { m.set(k, (m.get(k) ?? 0) + by); }

export function emptyInsights(now = new Date()): Insights {
  return {
    generatedAt: now.toISOString(),
    months: [],
    platforms: [],
    totals: { items: 0, watches: 0, searches: 0 },
    headline: { title: 'No history yet', detail: 'Add an export to see how your feed drifts.' },
    monthly: [],
    rising: [],
    falling: [],
    chosen: { windowDays: CHOSEN_WINDOW_DAYS, chosenPct: 0, servedPct: 0, byPlatform: [] },
    turningPoints: [],
    topics: {},
    range: { monthThen: '', topicsThen: 0, monthNow: '', topicsNow: 0, narrowing: false },
    platformInterests: [],
    actualTopics: [],
    ads: { advertisers: [], adItems: 0, tactics: [] },
    digest: { weekOf: '', lines: [] },
  };
}

// ── main ───────────────────────────────────────────────────────────

export function buildInsights(input: InsightsInput): Insights {
  const { events, times } = input;
  if (events.length === 0) {
    const out = emptyInsights(input.now);
    out.ads.advertisers = sortAdvertisers(input.advertisers);
    out.platformInterests = interestsVsActual(input.interests, new Set());
    return out;
  }

  const firstMonth = monthNum(times[0]);
  const lastMonth = monthNum(times[times.length - 1]);
  const nMonths = lastMonth - firstMonth + 1;
  const months = Array.from({ length: nMonths }, (_, i) => monthStr(firstMonth + i));
  const monthIdx = times.map((t) => monthNum(t) - firstMonth);
  const nowMs = input.now?.getTime() ?? times[times.length - 1];
  const followIdx = buildFollowIndex(input.follows);

  // Viewing counts per topic per month.
  const monthTotals = new Array<number>(nMonths).fill(0);
  const topicMonth = new Map<TopicId, number[]>();
  const topicTotal = new Map<TopicId, number>();
  let watches = 0, searches = 0;
  const platformStats = new Map<Platform, { items: number; from: number; to: number }>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind === 'watch') watches++;
    else if (e.kind === 'search') searches++;
    const ps = platformStats.get(e.platform);
    if (ps) { ps.items++; ps.to = times[i]; } else platformStats.set(e.platform, { items: 1, from: times[i], to: times[i] });
    if (!isViewing(e)) continue;
    const m = monthIdx[i];
    monthTotals[m]++;
    let arr = topicMonth.get(e.topic);
    if (!arr) topicMonth.set(e.topic, (arr = new Array<number>(nMonths).fill(0)));
    arr[m]++;
    inc(topicTotal, e.topic);
  }

  const share = (topic: TopicId, m: number) => pct(topicMonth.get(topic)?.[m] ?? 0, monthTotals[m]);
  const viewingTotal = monthTotals.reduce((a, b) => a + b, 0);
  const ranked = [...topicTotal.entries()].filter(([t]) => t !== OTHER).sort((a, b) => b[1] - a[1]);
  const topTopics = ranked.slice(0, MONTHLY_TOP).map(([t]) => t);

  // Monthly shares.
  const monthly: Insights['monthly'] = topTopics.map((t) => ({
    topic: t, label: topicLabel(t), shares: months.map((_, m) => round1(share(t, m))),
  }));
  if (viewingTotal > ranked.slice(0, MONTHLY_TOP).reduce((a, [, n]) => a + n, 0)) {
    const top = new Set(topTopics);
    monthly.push({
      topic: OTHER, label: topicLabel(OTHER),
      shares: months.map((_, m) => {
        let rest = monthTotals[m];
        for (const t of top) rest -= topicMonth.get(t)?.[m] ?? 0;
        return round1(pct(rest, monthTotals[m]));
      }),
    });
  }

  // Comparison months: ~6 months back (or earliest with viewing) vs latest with viewing.
  let lastIdx = -1, firstIdx = -1;
  for (let m = 0; m < nMonths; m++) if (monthTotals[m] > 0) { if (firstIdx < 0) firstIdx = m; lastIdx = m; }
  // A tiny last month (export taken early in the month) is too noisy; step back one.
  if (lastIdx > firstIdx && monthTotals[lastIdx] < MIN_MONTH_ITEMS && monthTotals[lastIdx - 1] >= MIN_MONTH_ITEMS) lastIdx--;
  let fromIdx = lastIdx < 0 ? -1 : Math.max(firstIdx, lastIdx - COMPARE_MONTHS_BACK);
  while (fromIdx >= 0 && fromIdx < lastIdx && monthTotals[fromIdx] === 0) fromIdx++;
  const canCompare = fromIdx >= 0 && fromIdx < lastIdx;

  const deltas: TopicDelta[] = [];
  if (canCompare) {
    for (const t of topicTotal.keys()) {
      if (t === OTHER) continue;
      const from = round1(share(t, fromIdx));
      const to = round1(share(t, lastIdx));
      if (from === 0 && to === 0) continue;
      deltas.push({ topic: t, label: topicLabel(t), from, to, delta: round1(to - from) });
    }
  }
  const rising = deltas.filter((d) => d.delta >= 1).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const falling = deltas.filter((d) => d.delta <= -1).sort((a, b) => a.delta - b.delta).slice(0, 5);

  // Chosen vs served, last 30 days.
  const windowStart = nowMs - CHOSEN_WINDOW_DAYS * DAY_MS;
  let wAll = 0, wChosen = 0;
  const byPlat = new Map<Platform, { n: number; chosen: number }>();
  for (let i = events.length - 1; i >= 0 && times[i] > windowStart; i--) {
    if (times[i] > nowMs) continue;
    const e = events[i];
    wAll++;
    const c = isChosen(e) ? 1 : 0;
    wChosen += c;
    const b = byPlat.get(e.platform) ?? { n: 0, chosen: 0 };
    b.n++; b.chosen += c;
    byPlat.set(e.platform, b);
  }
  const chosenPct = Math.round(pct(wChosen, wAll));
  const chosen: Insights['chosen'] = {
    windowDays: CHOSEN_WINDOW_DAYS,
    chosenPct,
    servedPct: wAll ? 100 - chosenPct : 0,
    byPlatform: [...byPlat.entries()]
      .map(([platform, b]) => ({ platform, chosenPct: Math.round(pct(b.chosen, b.n)), items: b.n }))
      .sort((a, b) => b.items - a.items),
  };

  const ctx: Ctx = { events, monthIdx, months, monthTotals, share, followIdx };
  const turningPoints = findTurningPoints(ctx, topTopics.slice(0, 6));

  // Topic details.
  const fromMonth = canCompare ? months[fromIdx] : lastIdx >= 0 ? months[lastIdx] : months[0];
  const toMonth = lastIdx >= 0 ? months[lastIdx] : months[months.length - 1];
  const topics = buildTopicDetails(ctx, fromMonth, toMonth, canCompare ? fromIdx : lastIdx, lastIdx);

  // Range: topics making up 80% of viewing.
  const topicsFor = (m: number) => {
    if (m < 0) return 0;
    const counts = [...topicMonth.entries()].filter(([t]) => t !== OTHER).map(([, a]) => a[m]).filter((n) => n > 0).sort((a, b) => b - a);
    const total = counts.reduce((a, b) => a + b, 0);
    let acc = 0, k = 0;
    for (const n of counts) { if (acc >= total * 0.8) break; acc += n; k++; }
    return k;
  };
  const rangeThen = canCompare ? fromIdx : lastIdx;
  const topicsThen = topicsFor(rangeThen);
  const topicsNow = topicsFor(lastIdx);
  const range: Insights['range'] = {
    monthThen: rangeThen >= 0 ? months[rangeThen] : '',
    topicsThen,
    monthNow: lastIdx >= 0 ? months[lastIdx] : '',
    topicsNow,
    narrowing: canCompare && topicsNow < topicsThen,
  };

  // Actual topics: share of all viewing >= 3%.
  const actual = ranked.filter(([, n]) => pct(n, viewingTotal) >= 3).slice(0, 10).map(([t]) => t);
  const actualTopics = actual.map(topicLabel);
  const platformInterests = interestsVsActual(input.interests, new Set(actual));

  const adItems = events.reduce((n, e) => n + (e.origin === 'pushed' ? 1 : 0), 0);

  const headline = buildHeadline({
    canCompare, rising, falling, fromMonth, watches, searches, ranked, viewingTotal, nMonthsWithData: monthTotals.filter((n) => n > 0).length,
    onlyTikTok: [...platformStats.keys()].every((p) => p === 'tiktok'),
    monthly, turningPoints,
  });

  return {
    generatedAt: new Date().toISOString(),
    months,
    platforms: [...platformStats.entries()]
      .map(([platform, s]) => ({ platform, items: s.items, from: isoDate(s.from), to: isoDate(s.to) }))
      .sort((a, b) => b.items - a.items),
    totals: { items: events.length, watches, searches },
    headline,
    monthly,
    rising,
    falling,
    chosen,
    turningPoints,
    topics,
    range,
    platformInterests,
    actualTopics,
    ads: { advertisers: sortAdvertisers(input.advertisers), adItems, ...analyseAds(events) },
    digest: buildDigest(events, times, nowMs),
  };
}

interface Ctx {
  events: ClassifiedEvent[];
  monthIdx: number[];
  months: string[];
  monthTotals: number[];
  share: (topic: TopicId, m: number) => number;
  followIdx: ReturnType<typeof buildFollowIndex>;
}

// ── turning points ────────────────────────────────────────────────

function findTurningPoints(ctx: Ctx, topics: TopicId[]): TurningPoint[] {
  const valid = ctx.monthTotals.map((n, m) => (n >= MIN_MONTH_ITEMS ? m : -1)).filter((m) => m >= 0);
  if (valid.length < 3) return [];
  const W = 3;
  const minSide = valid.length >= 4 ? 2 : 1;
  const found: (TurningPoint & { size: number })[] = [];

  for (const topic of topics) {
    const s = valid.map((m) => ctx.share(topic, m));
    let bestP = -1, bestD = 0;
    for (let p = 1; p < valid.length; p++) {
      const before = s.slice(Math.max(0, p - W), p);
      const after = s.slice(p, p + W);
      if (Math.min(before.length, after.length) < minSide) continue;
      const d = mean(after) - mean(before);
      if (Math.abs(d) > Math.abs(bestD) + 1e-9) { bestD = d; bestP = p; }
    }
    if (bestP < 0 || Math.abs(bestD) < 5) continue;
    const before = valid.slice(Math.max(0, bestP - W), bestP);
    const after = valid.slice(bestP, bestP + W);
    const direction = bestD > 0 ? 'up' : 'down';
    found.push({
      month: ctx.months[valid[bestP]],
      topic,
      label: topicLabel(topic),
      direction,
      explanation: explain(ctx, topic, direction, before, after),
      size: Math.abs(bestD),
    });
  }
  return found
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ size, ...tp }) => { void size; return tp; });
}

interface WindowStats { watches: number; served: number; searches: number; servedSources: Map<string, number>; sources: Map<string, number> }

function windowStats(ctx: Ctx, topic: TopicId, monthSet: Set<number>): WindowStats {
  const st: WindowStats = { watches: 0, served: 0, searches: 0, servedSources: new Map(), sources: new Map() };
  for (let i = 0; i < ctx.events.length; i++) {
    const e = ctx.events[i];
    if (e.topic !== topic || !monthSet.has(ctx.monthIdx[i])) continue;
    if (e.kind === 'search') { st.searches++; continue; }
    if (e.kind !== 'watch') continue;
    st.watches++;
    const name = e.channel?.name;
    if (name) inc(st.sources, name);
    if (!isChosen(e)) {
      st.served++;
      if (name) inc(st.servedSources, name);
    }
  }
  return st;
}

function explain(ctx: Ctx, topic: TopicId, dir: 'up' | 'down', before: number[], after: number[]): string {
  const label = lower(topicLabel(topic));
  const a = windowStats(ctx, topic, new Set(after));
  const b = windowStats(ctx, topic, new Set(before));
  const startMonth = monthName(ctx.months[after[0]]);
  const prevMonth = monthName(ctx.months[before[before.length - 1]]);

  if (dir === 'up') {
    const servedPct = Math.round(pct(a.served, a.watches));
    const searchNote = a.searches === 0
      ? "You didn't search for it."
      : `You searched for it ${plural(a.searches, 'time')}.`;
    if (servedPct >= 50) {
      const src = topEntry(a.servedSources);
      const from = src && src[1] >= 3 && src[1] >= a.served * 0.2 ? `, most often from ${src[0]}` : '';
      return `Mostly served to you: ${servedPct}% came from the feed${from}. ${searchNote}`;
    }
    const src = topEntry(a.sources);
    return `Mostly your choice: ${100 - servedPct}% followed a search, a follow or a return visit${src ? `, led by ${src[0]}` : ''}.`;
  }

  const perMonthBefore = b.searches / before.length;
  const perMonthAfter = a.searches / after.length;
  if (perMonthBefore >= 1 && perMonthAfter <= perMonthBefore * 0.6) {
    return `Fewer searches from you after ${prevMonth}: about ${fmt(perMonthAfter)} a month, down from ${fmt(perMonthBefore)}.`;
  }
  // Source that dropped the most.
  let worst: [string, number, number] | undefined;
  for (const [name, n] of b.sources) {
    const nb = n / before.length;
    const na = (a.sources.get(name) ?? 0) / after.length;
    if (nb >= 3 && nb - na >= nb * 0.5 && (!worst || nb - na > worst[1] - worst[2])) worst = [name, nb, na];
  }
  if (worst) {
    return `Less ${label} from ${startMonth}: videos from ${worst[0]} went from about ${fmt(worst[1])} a month to ${fmt(worst[2])}.`;
  }
  const from = Math.round(mean(before.map((m) => ctx.share(topic, m))));
  const to = Math.round(mean(after.map((m) => ctx.share(topic, m))));
  return `Your feed showed you less ${label} from ${startMonth}: ${to}% of your viewing, down from ${from}%.`;
}

// ── topic details ─────────────────────────────────────────────────

function buildTopicDetails(ctx: Ctx, fromMonth: string, toMonth: string, fromIdx: number, toIdx: number): Record<TopicId, TopicDetail> {
  interface Acc {
    count: number; served: number; idxs: number[];
    sources: Map<string, { name: string; platform: Platform; count: number; chosen: number; subscribed: boolean }>;
  }
  const acc = new Map<TopicId, Acc>();
  ctx.events.forEach((e, i) => {
    let a = acc.get(e.topic);
    if (!a) acc.set(e.topic, (a = { count: 0, served: 0, idxs: [], sources: new Map() }));
    a.count++;
    if (!isChosen(e)) a.served++;
    a.idxs.push(i);
    let key: string, name: string;
    if (e.kind === 'search') { key = `search:${e.platform}`; name = 'Your searches'; }
    else {
      const ck = channelKey(e);
      if (ck && e.channel?.name) { key = `ch:${ck}`; name = e.channel.name; }
      else if (e.kind === 'watch' || e.kind === 'ad') { key = `none:${e.platform}`; name = `Other ${PLATFORM_LABEL[e.platform]} videos`; }
      else { key = `engaged:${e.platform}`; name = `Things you liked or saved on ${PLATFORM_LABEL[e.platform]}`; }
    }
    let s = a.sources.get(key);
    if (!s) a.sources.set(key, (s = { name, platform: e.platform, count: 0, chosen: 0, subscribed: isFollowed(e, ctx.followIdx) }));
    s.count++;
    if (isChosen(e)) s.chosen++;
  });

  const out: Record<TopicId, TopicDetail> = {};
  for (const [topic, a] of acc) {
    const sources: TopicSource[] = [...a.sources.values()]
      .sort((x, y) => y.count - x.count)
      .slice(0, 10)
      .map((s) => ({
        name: s.name, platform: s.platform, count: s.count,
        origin: s.chosen * 2 >= s.count ? 'chosen' : 'served', subscribed: s.subscribed,
      }));
    const recentItems = a.idxs.slice(-50).reverse().map((i) => {
      const e = ctx.events[i];
      return { title: e.title ?? e.query, url: e.url, time: e.time, origin: e.origin, platform: e.platform };
    });
    out[topic] = {
      topic,
      label: topicLabel(topic),
      sensitive: topicSensitive(topic),
      shareFrom: topic === UNKNOWN || fromIdx < 0 ? 0 : round1(ctx.share(topic, fromIdx)),
      shareTo: topic === UNKNOWN || toIdx < 0 ? 0 : round1(ctx.share(topic, toIdx)),
      fromMonth,
      toMonth,
      servedPct: Math.round(pct(a.served, a.count)),
      itemCount: a.count,
      sources,
      recentItems,
    };
  }
  return out;
}

// ── platform interests ────────────────────────────────────────────

let KEYWORD_TOKENS: { id: TopicId; tokens: string[] }[] | undefined;
function keywordTokens() {
  return (KEYWORD_TOKENS ??= TOPIC_KEYWORDS.map((t) => ({
    id: t.id,
    tokens: [...new Set(tokenize(`${t.label} ${t.strong} ${t.normal}`.replace(/\*/g, '')).filter((x) => x.length >= 4))],
  })));
}

/** Map a free-text interest name ("Soccer", "Fitness & Health", "Hundar") to a topic. */
export function interestTopic(name: string): TopicId | undefined {
  const direct = matchTopic(name);
  if (direct) return direct;
  const toks = contentTokens(name).filter((t) => t.length >= 4);
  if (!toks.length) return undefined;
  let best: TopicId | undefined, bestN = 0;
  for (const { id, tokens } of keywordTokens()) {
    let n = 0;
    for (const t of toks) if (tokens.some((k) => tokensMatch(t, k))) n++;
    if (n > bestN) { bestN = n; best = id; }
  }
  return best;
}

function interestsVsActual(lists: PlatformInterestList[], actual: Set<TopicId>): Insights['platformInterests'] {
  return lists.map((l) => ({
    platform: l.platform,
    interests: l.interests.map((name) => {
      const t = interestTopic(name);
      return { name, matches: t !== undefined && actual.has(t) };
    }),
  }));
}

function sortAdvertisers(ads: AdvertiserRecord[]): AdvertiserRecord[] {
  return [...ads].sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name));
}

// ── headline ──────────────────────────────────────────────────────

function buildHeadline(h: {
  canCompare: boolean; rising: TopicDelta[]; falling: TopicDelta[]; fromMonth: string;
  watches: number; searches: number; ranked: [TopicId, number][]; viewingTotal: number;
  nMonthsWithData: number; onlyTikTok: boolean;
  monthly: Insights['monthly']; turningPoints: Insights['turningPoints'];
}): Insights['headline'] {
  const basis = `${fmt(h.watches + h.searches)} videos and searches`;
  if (h.viewingTotal === 0 || h.ranked.length === 0) {
    return {
      title: "We can't see topics yet",
      detail: h.onlyTikTok
        ? `TikTok watch history has no titles. Based on ${basis}.`
        : `Your history has no titles or searches we can read. Based on ${basis}.`,
    };
  }
  const top = h.ranked[0][0];
  if (!h.canCompare || h.nMonthsWithData < 3) {
    return {
      title: `Your feed is mostly ${lower(topicLabel(top))}`,
      detail: h.nMonthsWithData <= 1
        ? `Based on ${basis} from one month. Add more history to see drift.`
        : `Based on ${basis} from ${h.nMonthsWithData} months. Drift needs at least 3 months of history.`,
      topic: top,
    };
  }
  const up = h.rising[0];
  const down = h.falling[0];
  const biggest = !down || (up && up.delta >= -down.delta) ? up : down;
  if (!biggest || !isRealShift(biggest, h.monthly, h.turningPoints)) {
    return { title: 'Your feed stayed steady', detail: `Little change since ${monthName(h.fromMonth)}, based on ${basis}`, topic: top };
  }
  const size = Math.abs(biggest.delta);
  const strength = size < 8 ? 'Small shift' : size < 15 ? 'Moderate shift' : 'Big shift';
  return {
    title: biggest.delta > 0
      ? `Your feed drifted toward ${lower(biggest.label)}`
      : `Your feed drifted away from ${lower(biggest.label)}`,
    detail: `${strength}, based on ${basis}`,
    topic: biggest.topic,
  };
}

/**
 * A change counts as drift only if it stands out from the topic's normal month-to-month wobble:
 * a turning point backs it, or it is several times the typical monthly change (and at least 5 points).
 */
function isRealShift(d: TopicDelta, monthly: Insights['monthly'], tps: Insights['turningPoints']): boolean {
  const size = Math.abs(d.delta);
  if (size < 5) return false;
  if (tps.some((t) => t.topic === d.topic && (t.direction === 'up') === (d.delta > 0))) return true;
  const shares = monthly.find((m) => m.topic === d.topic)?.shares ?? [];
  const steps = shares.slice(1).map((v, i) => Math.abs(v - shares[i])).sort((a, b) => a - b);
  const typical = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  return size >= Math.max(8, 3 * typical);
}

// ── weekly digest ─────────────────────────────────────────────────

function buildDigest(events: ClassifiedEvent[], times: number[], nowMs: number): Insights['digest'] {
  const nowDay = Math.floor(nowMs / DAY_MS);
  const dow = (new Date(nowDay * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = (nowDay - dow) * DAY_MS;
  const weekStart = nowMs >= thisMonday + 7 * DAY_MS ? thisMonday : thisMonday - 7 * DAY_MS;
  const weekEnd = weekStart + 7 * DAY_MS;
  const prevStart = weekStart - 7 * DAY_MS;

  const week = summarize(events, times, weekStart, weekEnd);
  const prev = summarize(events, times, prevStart, weekStart);
  const lines: string[] = [];
  if (week.items === 0) return { weekOf: isoDate(weekStart), lines: ['No activity this week.'] };

  const diff = week.watches - prev.watches;
  const cmp = prev.items === 0 ? '' : diff === 0 ? ', the same as the week before' : `, ${fmt(Math.abs(diff))} ${diff > 0 ? 'more' : 'fewer'} than the week before`;
  lines.push(`You watched ${plural(week.watches, 'video')}${cmp}.`);
  if (week.searches > 0) lines.push(`You searched ${plural(week.searches, 'time')}.`);

  const topW = topEntry(week.topics);
  if (topW && week.viewing > 0) {
    const s = Math.round(pct(topW[1], week.viewing));
    const ps = prev.viewing ? Math.round(pct(prev.topics.get(topW[0]) ?? 0, prev.viewing)) : undefined;
    lines.push(`Most watched: ${lower(topicLabel(topW[0]))}, ${s}% of your viewing${ps !== undefined ? ` (${ps}% the week before)` : ''}.`);
  }
  if (week.watches > 0) {
    const c = Math.round(pct(week.chosenWatches, week.watches));
    const pc = prev.watches ? ` (${Math.round(pct(prev.chosenWatches, prev.watches))}% the week before)` : '';
    lines.push(`You chose ${c}% of what you watched${pc}. The rest was served.`);
  }
  if (prev.viewing > 0 && week.viewing > 0) {
    let best: [TopicId, number] | undefined;
    for (const [t, n] of week.topics) {
      const d = pct(n, week.viewing) - pct(prev.topics.get(t) ?? 0, prev.viewing);
      if (t !== topW?.[0] && (!best || d > best[1])) best = [t, d];
    }
    if (best && best[1] >= 3) lines.push(`Rising: ${lower(topicLabel(best[0]))}, up ${Math.round(best[1])} points.`);
  }
  let newSrc: [string, number] | undefined;
  for (const [name, n] of week.sources) if (!prev.sources.has(name) && n >= 3 && (!newSrc || n > newSrc[1])) newSrc = [name, n];
  if (newSrc && prev.items > 0) lines.push(`New in your feed: ${newSrc[0]} (${plural(newSrc[1], 'video')}).`);
  return { weekOf: isoDate(weekStart), lines };
}

function summarize(events: ClassifiedEvent[], times: number[], start: number, end: number) {
  const s = { items: 0, watches: 0, searches: 0, viewing: 0, chosenWatches: 0, topics: new Map<TopicId, number>(), sources: new Map<string, number>() };
  // Binary search to the window start.
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < start) lo = mid + 1; else hi = mid; }
  for (let i = lo; i < times.length && times[i] < end; i++) {
    const e = events[i];
    s.items++;
    if (e.kind === 'search') s.searches++;
    if (e.kind !== 'watch') continue;
    s.watches++;
    if (isChosen(e)) s.chosenWatches++;
    if (e.channel?.name) inc(s.sources, e.channel.name);
    if (e.topic !== UNKNOWN) {
      s.viewing++;
      if (e.topic !== OTHER) inc(s.topics, e.topic);
    }
  }
  return s;
}
