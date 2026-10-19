// Persona simulator: seeded, YouTube-like watch/search histories with per-event ground truth.
// Ground truth is what a scripted test account would know: how each item really got in
// front of the user (search, subscription, deliberate return, autoplay, home feed, ad),
// its true topic, and when the scripted drift starts.
import type { DriftEvent, FollowRecord, Origin, TopicId } from '@/lib/types';
import type { AnalysisInput } from '@/lib/analysis';
import { ADS, POOLS, channelUrl, servedChannels } from './pools';

// ── random helpers ─────────────────────────────────────────────────

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, to derive a per-persona seed. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Rand = () => number;
export type Mix = Partial<Record<TopicId, number>>;

const pick = <T>(r: Rand, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const between = (r: Rand, lo: number, hi: number) => lo + r() * (hi - lo);
const intBetween = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** Index 0..n-1 with Zipf(1) weights: a few channels dominate, with a long tail. */
function zipfIndex(r: Rand, n: number): number {
  let total = 0;
  for (let i = 1; i <= n; i++) total += 1 / i;
  let x = r() * total;
  for (let i = 1; i <= n; i++) { x -= 1 / i; if (x <= 0) return i - 1; }
  return n - 1;
}

function sampleMix(r: Rand, mix: Mix): TopicId {
  const entries = Object.entries(mix).filter(([, w]) => (w ?? 0) > 0) as [TopicId, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries[entries.length - 1][0];
}

function blend(a: Mix, b: Mix, p: number): Mix {
  const out: Mix = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = (a[k] ?? 0) * (1 - p) + (b[k] ?? 0) * p;
  return out;
}

// ── personas ───────────────────────────────────────────────────────

/** The true way an item reached the user. */
export type TrueReason = 'search' | 'search_result' | 'subscription' | 'return' | 'autoplay' | 'home_feed' | 'ad' | 'like';

export const REASON_ORIGIN: Record<TrueReason, Origin> = {
  search: 'chosen', search_result: 'chosen', subscription: 'chosen', return: 'chosen',
  autoplay: 'served', home_feed: 'served', ad: 'pushed', like: 'engaged',
};

export interface GroundTruth {
  origin: Origin;
  reason: TrueReason;
  topic: TopicId;
  /** Watch of a removed video: the export has no title or channel. */
  removed?: boolean;
  /** Autoplay/home-feed video from a channel the user subscribes to (a known hard case). */
  servedFromSubscription?: boolean;
}

export interface DriftScript {
  /** Month index (0-based from `start`) where the change begins. */
  onset: number;
  target: TopicId;
  /** Topic that loses share, if any. */
  declining?: TopicId;
  /** 'served': the feed pushes it (autoplay, home). 'chosen': the user starts searching for it. */
  via: 'served' | 'chosen';
  /** Months to go from the old to the new mix. */
  rampMonths: number;
  servedAfter: Mix;
  chosenAfter?: Mix;
  /** Probability autoplay stays on the target once it is there (rabbit hole). */
  targetStay?: number;
}

export interface Persona {
  id: string;
  label: string;
  description: string;
  /** 'YYYY-MM' */
  start: string;
  months: number;
  /** Share of titles in Swedish. */
  svShare: number;
  /** Mean sessions per day. */
  sessionsPerDay: number;
  /** Activity multiplier per calendar month (1-12). */
  volume?: (calendarMonth: number) => number;
  /** How sessions start. */
  starts: { search: number; subscription: number; return: number; home: number };
  /** Topics the user goes looking for (searches). */
  chosenMix: Mix;
  /** Topics the feed serves (autoplay, home feed). */
  servedMix: Mix;
  subscriptions: { name: string; topic: TopicId }[];
  /** Channels the user opens directly, often, without subscribing. */
  favourites: { name: string; topic: TopicId }[];
  /** Autoplay videos after the opening of a session. */
  chain: [number, number];
  /** Probability autoplay stays on the same topic. */
  stay: number;
  /** Search rounds per search session. */
  searchRounds?: [number, number];
  drift?: DriftScript;
  adRate?: number;
  removedRate?: number;
  likeRate?: number;
  /** Probability an autoplay pick comes from a subscribed channel of that topic. */
  subscribedServedRate?: number;
}

const summer = (m: number) => (m >= 6 && m <= 8 ? 1.6 : m === 12 ? 1.3 : 1);
const winterHeavy = (m: number) => (m <= 2 || m >= 11 ? 1.25 : m >= 6 && m <= 7 ? 0.7 : 1);

export const PERSONAS: Persona[] = [
  {
    id: 'football_to_politics',
    label: 'Football fan drifting to politics',
    description: 'Watches football and cooking; from May the feed starts autoplaying political clips and rage-bait commentary. Never searches for politics.',
    start: '2026-01', months: 10, svShare: 0.3, sessionsPerDay: 2.4, volume: winterHeavy,
    starts: { search: 0.3, subscription: 0.25, return: 0.1, home: 0.35 },
    chosenMix: { football: 0.6, food: 0.15, music: 0.1, tech: 0.15 },
    servedMix: { football: 0.35, comedy: 0.12, music: 0.1, food: 0.1, tech: 0.08, gaming: 0.08, cars: 0.07, politics: 0.04, film_tv: 0.06 },
    subscriptions: [{ name: 'Premier Goals', topic: 'football' }, { name: 'Allsvenskan Play', topic: 'football' }, { name: 'Home Kitchen', topic: 'food' }],
    favourites: [{ name: 'Tifo Talk', topic: 'football' }],
    chain: [1, 6], stay: 0.55,
    drift: {
      onset: 4, target: 'politics', declining: 'football', via: 'served', rampMonths: 2, targetStay: 0.8,
      servedAfter: { politics: 0.4, football: 0.2, comedy: 0.1, music: 0.07, food: 0.08, tech: 0.05, gaming: 0.04, cars: 0.03, film_tv: 0.03 },
    },
  },
  {
    id: 'runner_to_dieting',
    label: 'Runner drifting to extreme dieting',
    description: 'Searches for running and marathon training. From May, autoplay after running videos increasingly lands on calorie counting and fasting content.',
    start: '2026-02', months: 9, svShare: 0.25, sessionsPerDay: 2.2,
    starts: { search: 0.4, subscription: 0.2, return: 0.1, home: 0.3 },
    chosenMix: { fitness: 0.65, food: 0.15, music: 0.1, travel: 0.1 },
    servedMix: { fitness: 0.35, food: 0.14, health: 0.1, music: 0.1, lifestyle: 0.1, comedy: 0.08, dieting: 0.05, beauty: 0.08 },
    subscriptions: [{ name: 'Run Club', topic: 'fitness' }, { name: 'Löparpodden', topic: 'fitness' }],
    favourites: [{ name: 'Sage Runs', topic: 'fitness' }],
    chain: [1, 5], stay: 0.5,
    drift: {
      onset: 3, target: 'dieting', via: 'served', rampMonths: 2, targetStay: 0.8,
      servedAfter: { dieting: 0.42, fitness: 0.22, food: 0.08, health: 0.08, music: 0.06, lifestyle: 0.06, comedy: 0.04, beauty: 0.04 },
    },
  },
  {
    id: 'gamer_stable',
    label: 'Gamer, stable control (no drift)',
    description: 'Gaming, tech and comedy throughout. No scripted drift, but much more viewing in the summer holidays.',
    start: '2026-01', months: 10, svShare: 0.3, sessionsPerDay: 2.6, volume: summer,
    starts: { search: 0.3, subscription: 0.3, return: 0.1, home: 0.3 },
    chosenMix: { gaming: 0.7, tech: 0.15, comedy: 0.15 },
    servedMix: { gaming: 0.5, tech: 0.15, comedy: 0.15, music: 0.1, film_tv: 0.1 },
    subscriptions: [{ name: 'Pixel Plays', topic: 'gaming' }, { name: 'Spelhörnan', topic: 'gaming' }, { name: 'Byte Review', topic: 'tech' }],
    favourites: [{ name: 'Clutch Kings', topic: 'gaming' }],
    chain: [1, 6], stay: 0.6,
  },
  {
    id: 'heavy_subscriber',
    label: 'Heavy subscriber drifting to true crime',
    description: 'Opens the subscriptions feed for cooking, science and tech. From July the home feed starts slipping in true crime documentaries.',
    start: '2026-01', months: 10, svShare: 0.3, sessionsPerDay: 2.2,
    starts: { search: 0.1, subscription: 0.6, return: 0.1, home: 0.2 },
    chosenMix: { food: 0.3, science: 0.3, tech: 0.2, education: 0.2 },
    servedMix: { food: 0.25, science: 0.2, tech: 0.15, education: 0.15, comedy: 0.1, true_crime: 0.05, animals: 0.1 },
    subscriptions: [
      { name: 'Mormors Recept', topic: 'food' }, { name: 'Fork & Flame', topic: 'food' }, { name: 'Cosmic Minute', topic: 'science' },
      { name: 'Curious Lab', topic: 'science' }, { name: 'Teknikveckan', topic: 'tech' }, { name: 'History in Maps', topic: 'education' },
    ],
    favourites: [{ name: 'Weeknight Eats', topic: 'food' }],
    chain: [0, 4], stay: 0.55, subscribedServedRate: 0.25,
    drift: {
      onset: 6, target: 'true_crime', via: 'served', rampMonths: 2, targetStay: 0.75,
      servedAfter: { true_crime: 0.4, food: 0.15, science: 0.12, tech: 0.1, education: 0.08, comedy: 0.08, animals: 0.07 },
    },
  },
  {
    id: 'heavy_searcher',
    label: 'Heavy searcher drifting to travel by choice',
    description: 'Searches for nearly everything (tech, learning, money). From June starts planning a trip and searches for travel. A chosen drift, not a served one.',
    start: '2026-01', months: 10, svShare: 0.2, sessionsPerDay: 2.0,
    starts: { search: 0.75, subscription: 0.05, return: 0.05, home: 0.15 },
    chosenMix: { tech: 0.4, education: 0.3, finance: 0.2, food: 0.1 },
    servedMix: { tech: 0.3, education: 0.2, finance: 0.15, comedy: 0.15, food: 0.1, music: 0.1 },
    subscriptions: [{ name: 'Code in 100', topic: 'tech' }],
    favourites: [{ name: 'Index Ivan', topic: 'finance' }],
    chain: [0, 2], stay: 0.6, searchRounds: [1, 3],
    drift: {
      onset: 5, target: 'travel', via: 'chosen', rampMonths: 1,
      chosenAfter: { travel: 0.5, tech: 0.2, education: 0.15, finance: 0.1, food: 0.05 },
      servedAfter: { tech: 0.3, education: 0.2, finance: 0.15, comedy: 0.15, food: 0.1, music: 0.1 },
    },
  },
  {
    id: 'bilingual_swedish',
    label: 'Bilingual Swedish user drifting to true crime',
    description: 'Mostly Swedish titles: music, food, comedy, lifestyle. From May autoplay pulls in Swedish true crime and gang-violence documentaries.',
    start: '2026-02', months: 8, svShare: 0.75, sessionsPerDay: 2.0,
    starts: { search: 0.25, subscription: 0.25, return: 0.1, home: 0.4 },
    chosenMix: { music: 0.3, food: 0.25, comedy: 0.2, football: 0.1, lifestyle: 0.15 },
    servedMix: { music: 0.25, food: 0.2, comedy: 0.2, lifestyle: 0.15, football: 0.1, true_crime: 0.04, film_tv: 0.06 },
    subscriptions: [{ name: 'Svensk Musik Live', topic: 'music' }, { name: 'Skrattfabriken', topic: 'comedy' }, { name: 'Hemma hos Hanna', topic: 'lifestyle' }],
    favourites: [{ name: 'Mormors Recept', topic: 'food' }],
    chain: [1, 5], stay: 0.5,
    drift: {
      onset: 3, target: 'true_crime', via: 'served', rampMonths: 2, targetStay: 0.8,
      servedAfter: { true_crime: 0.38, music: 0.16, food: 0.12, comedy: 0.12, lifestyle: 0.1, football: 0.06, film_tv: 0.06 },
    },
  },
  {
    id: 'sparse_2month',
    label: 'Sparse user, 2 months (control)',
    description: 'Light viewing over two months: music, food, animals. Too little history to judge drift.',
    start: '2026-08', months: 2, svShare: 0.4, sessionsPerDay: 0.6,
    starts: { search: 0.3, subscription: 0.2, return: 0.1, home: 0.4 },
    chosenMix: { music: 0.4, food: 0.4, animals: 0.2 },
    servedMix: { music: 0.3, food: 0.3, animals: 0.2, comedy: 0.2 },
    subscriptions: [{ name: 'Lofi Lounge', topic: 'music' }],
    favourites: [],
    chain: [0, 3], stay: 0.5,
  },
];

// ── simulation ─────────────────────────────────────────────────────

export interface Simulation {
  persona: Persona;
  seed: number;
  input: AnalysisInput;
  /** Ground truth per event id. */
  truth: Map<string, GroundTruth>;
  /** Months covered, 'YYYY-MM'. */
  months: string[];
  /** Scripted drift onset month, 'YYYY-MM', or undefined for no drift. */
  onsetMonth?: string;
}

export function monthString(start: string, offset: number): string {
  const [y, m] = start.split('-').map(Number);
  const n = y * 12 + (m - 1) + offset;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}

const MIN = 60_000;

/** Two to three content words from a title, lowercased: how people actually type searches. */
function queryFromTitle(r: Rand, title: string): string | undefined {
  const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
  if (words.length < 1) return undefined;
  const n = Math.min(words.length, intBetween(r, 1, 3));
  const at = intBetween(r, 0, words.length - n);
  return words.slice(at, at + n).join(' ');
}

export function simulate(persona: Persona, seed: number): Simulation {
  const r = rng(hashString(persona.id) ^ seed);
  const events: DriftEvent[] = [];
  const truth = new Map<string, GroundTruth>();
  let n = 0;
  const adRate = persona.adRate ?? 0.05;
  const removedRate = persona.removedRate ?? 0.03;
  const likeRate = persona.likeRate ?? 0.03;
  const subServed = persona.subscribedServedRate ?? 0.1;
  const drift = persona.drift;

  const emit = (e: Omit<DriftEvent, 'id' | 'platform'>, gt: GroundTruth) => {
    const id = `sim:${persona.id}:${seed}:${n++}`;
    events.push({ ...e, id, platform: 'youtube' });
    truth.set(id, gt);
  };

  const mixesFor = (mi: number) => {
    if (!drift || mi < drift.onset) return { chosen: persona.chosenMix, served: persona.servedMix };
    const p = Math.min(1, (mi - drift.onset + 1) / drift.rampMonths);
    return {
      chosen: drift.chosenAfter ? blend(persona.chosenMix, drift.chosenAfter, p) : persona.chosenMix,
      served: blend(persona.servedMix, drift.servedAfter, p),
    };
  };

  const titleFor = (topic: TopicId): string => {
    const pool = POOLS[topic];
    const sv = r() < persona.svShare;
    return pick(r, sv && pool.sv.length ? pool.sv : pool.en);
  };

  for (let mi = 0; mi < persona.months; mi++) {
    const month = monthString(persona.start, mi);
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const { chosen: chosenMix, served: servedMix } = mixesFor(mi);
    const vol = persona.volume?.(m) ?? 1;
    const driftActive = drift && mi >= drift.onset;

    for (let d = 1; d <= days; d++) {
      const dayStart = Date.UTC(y, m - 1, d);
      const weekend = [0, 6].includes(new Date(dayStart).getUTCDay()) ? 1.3 : 1;
      const lambda = persona.sessionsPerDay * vol * weekend;
      // Roughly Poisson: whole part plus a chance of one more, with jitter.
      const target = lambda * between(r, 0.5, 1.5);
      const sessions = Math.floor(target) + (r() < target - Math.floor(target) ? 1 : 0);
      let t = dayStart + between(r, 6.5, 9) * 3600_000;
      const dayEnd = dayStart + 23.5 * 3600_000;

      for (let s = 0; s < sessions && t < dayEnd; s++) {
        let lastTopic: TopicId = sampleMix(r, servedMix);

        const watch = (topic: TopicId, reason: TrueReason, channelName: string, extra: Partial<GroundTruth> = {}, fixedTitle?: string) => {
          if (r() < adRate) {
            const ad = pick(r, ADS);
            emit({ kind: 'watch', time: new Date(t - between(r, 5, 25) * 1000).toISOString(), title: ad.title, url: `https://www.youtube.com/watch?v=ad${n}`, fromAds: true }, { origin: 'pushed', reason: 'ad', topic: ad.topic });
          }
          const removed = r() < removedRate;
          const title = fixedTitle ?? titleFor(topic);
          const url = `https://www.youtube.com/watch?v=v${seed}x${n}`;
          if (removed) {
            emit({ kind: 'watch', time: new Date(t).toISOString(), url }, { origin: REASON_ORIGIN[reason], reason, topic, removed: true, ...extra });
          } else {
            emit(
              { kind: 'watch', time: new Date(t).toISOString(), title, url, channel: { name: channelName, url: channelUrl(channelName) } },
              { origin: REASON_ORIGIN[reason], reason, topic, ...extra },
            );
            if (r() < likeRate) {
              emit({ kind: 'like', time: new Date(t + between(r, 1, 2.5) * MIN).toISOString(), title, url, channel: { name: channelName, url: channelUrl(channelName) } }, { origin: 'engaged', reason: 'like', topic });
            }
          }
          lastTopic = topic;
        };

        const servedChannel = (topic: TopicId): { name: string; fromSub: boolean } => {
          const subs = persona.subscriptions.filter((c) => c.topic === topic);
          if (subs.length && r() < subServed) return { name: pick(r, subs).name, fromSub: true };
          const subNames = new Set(persona.subscriptions.map((c) => c.name));
          const pool = servedChannels(topic).filter((c) => !subNames.has(c));
          return { name: pool[zipfIndex(r, pool.length)], fromSub: false };
        };

        const autoplay = (len: number) => {
          for (let i = 0; i < len; i++) {
            t += between(r, 3, 8) * MIN;
            const stay = driftActive && lastTopic === drift!.target && drift!.targetStay ? drift!.targetStay : persona.stay;
            const topic = r() < stay ? lastTopic : sampleMix(r, servedMix);
            const ch = servedChannel(topic);
            watch(topic, 'autoplay', ch.name, ch.fromSub ? { servedFromSubscription: true } : {});
          }
        };

        const startType = sampleMix(r, {
          search: persona.starts.search,
          subscription: persona.subscriptions.length ? persona.starts.subscription : 0,
          return: persona.favourites.length ? persona.starts.return : 0,
          home: persona.starts.home,
        });
        const chainLen = () => intBetween(r, persona.chain[0], persona.chain[1]);

        if (startType === 'search') {
          const rounds = persona.searchRounds ? intBetween(r, persona.searchRounds[0], persona.searchRounds[1]) : 1;
          for (let k = 0; k < rounds; k++) {
            if (k > 0) t += between(r, 3, 8) * MIN;
            const topic = sampleMix(r, chosenMix);
            const first = titleFor(topic);
            const query = (r() < 0.7 ? queryFromTitle(r, first) : undefined) ?? pick(r, POOLS[topic].queries);
            emit({ kind: 'search', time: new Date(t).toISOString(), query, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` }, { origin: 'chosen', reason: 'search', topic });
            t += between(r, 0.3, 2) * MIN;
            const results = r() < 0.35 ? 2 : 1;
            for (let j = 0; j < results; j++) {
              if (j > 0) t += between(r, 3, 8) * MIN;
              watch(topic, 'search_result', pick(r, POOLS[topic].channels), {}, j === 0 ? first : undefined);
            }
            autoplay(persona.searchRounds ? intBetween(r, persona.chain[0], persona.chain[1]) : chainLen());
          }
        } else if (startType === 'subscription') {
          const k = intBetween(r, 1, 2);
          for (let j = 0; j < k; j++) {
            if (j > 0) t += between(r, 3, 8) * MIN;
            const c = pick(r, persona.subscriptions);
            watch(c.topic, 'subscription', c.name);
          }
          autoplay(chainLen());
        } else if (startType === 'return') {
          const c = pick(r, persona.favourites);
          const k = intBetween(r, 1, 2);
          for (let j = 0; j < k; j++) {
            if (j > 0) t += between(r, 3, 8) * MIN;
            watch(c.topic, 'return', c.name);
          }
          autoplay(chainLen());
        } else {
          const clicks = intBetween(r, 1, 3);
          for (let j = 0; j < clicks; j++) {
            if (j > 0) t += between(r, 4, 14) * MIN;
            const topic = sampleMix(r, servedMix);
            const ch = servedChannel(topic);
            watch(topic, 'home_feed', ch.name, ch.fromSub ? { servedFromSubscription: true } : {});
            autoplay(intBetween(r, 0, Math.max(0, persona.chain[1] - 2)));
          }
        }
        t += between(r, 25, 300) * MIN;
      }
    }
  }

  const follows: FollowRecord[] = persona.subscriptions.map((c) => ({ platform: 'youtube', name: c.name, url: channelUrl(c.name) }));
  return {
    persona,
    seed,
    input: { events, follows, interests: [], advertisers: [] },
    truth,
    months: Array.from({ length: persona.months }, (_, i) => monthString(persona.start, i)),
    onsetMonth: drift ? monthString(persona.start, drift.onset) : undefined,
  };
}
