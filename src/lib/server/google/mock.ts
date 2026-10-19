// OWNER: sync agent. DRIFT_GOOGLE_MOCK=1: fake Google connect + export, archive generated on the fly.
//
// The archive mirrors what the Data Portability API returns for myactivity.youtube,
// myactivity.search and youtube.subscriptions: a zip of My Activity JSON records
// (header/title/titleUrl/subtitles/time/products/details/activityControls, as in
// https://developers.google.com/data-portability/schema-reference/my_activity) and a
// subscriptions CSV (Channel Id, Channel Url, Channel Title). Google does not document the exact
// paths inside the zip; the mock uses a "Portability/" root so the client adapter is exercised.
import { strToU8, zipSync } from 'fflate';
import type { GoogleResource } from '@/lib/connectors/google/types';

export const MOCK_JOB_PREFIX = 'mock_';
/** A mock job completes this long after it was created. */
export const MOCK_JOB_MS = 4000;

export interface MockJob {
  /** Created, epoch ms. */
  t: number;
  /** startTime (ISO) when the export was incremental. */
  s?: string;
  r: GoogleResource[];
}

export function encodeMockJob(job: MockJob): string {
  return MOCK_JOB_PREFIX + Buffer.from(JSON.stringify(job), 'utf8').toString('base64url');
}

export function decodeMockJob(id: string): MockJob | undefined {
  if (!id.startsWith(MOCK_JOB_PREFIX) || id.length > 600) return undefined;
  try {
    const job = JSON.parse(Buffer.from(id.slice(MOCK_JOB_PREFIX.length), 'base64url').toString('utf8')) as MockJob;
    if (typeof job.t !== 'number' || !Array.isArray(job.r)) return undefined;
    if (job.s !== undefined && Number.isNaN(Date.parse(job.s))) return undefined;
    return job;
  } catch {
    return undefined;
  }
}

// ── Synthetic history ───────────────────────────────────────────────

interface MockChannel {
  name: string;
  id: string;
  subscribed: boolean;
  titles: string[];
}

const CHANNELS: MockChannel[] = [
  { name: 'Run Club Weekly', id: 'UCmockRun000000000000001', subscribed: true, titles: ['Marathon training plan week {n}', 'How to run faster 5k times', 'Easy run vs tempo run explained', 'Best running shoes of the year'] },
  { name: 'Kitchen Basics', id: 'UCmockCook00000000000002', subscribed: true, titles: ['15 minute pasta recipe', 'How to cook perfect rice', 'Meal prep for the week #{n}', 'One pan chicken dinner'] },
  { name: 'Code With Sam', id: 'UCmockCode00000000000003', subscribed: true, titles: ['TypeScript generics in 10 minutes', 'Build a web app with Next.js part {n}', 'Learn Python programming for beginners', 'Git tutorial: rebase vs merge'] },
  { name: 'Daily News Desk', id: 'UCmockNews00000000000004', subscribed: false, titles: ['Election debate highlights', 'Parliament votes on new budget', 'Breaking news: government minister resigns', 'Prime minister interview on policy'] },
  { name: 'Football Fix', id: 'UCmockFoot00000000000005', subscribed: false, titles: ['Premier League goals of the week {n}', 'Champions League match highlights', 'Top 10 football transfers', 'Derby match reaction'] },
  { name: 'Gaming Arena', id: 'UCmockGame00000000000006', subscribed: false, titles: ['Minecraft survival episode {n}', 'Fortnite new season gameplay', 'Speedrun world record attempt', 'Top 10 indie games this month'] },
  { name: 'Mindful Minutes', id: 'UCmockMind00000000000007', subscribed: true, titles: ['10 minute guided meditation', 'Yoga for beginners day {n}', 'Sleep better tonight: breathing exercise', 'Stretching routine for runners'] },
  { name: 'Money Talks', id: 'UCmockMony00000000000008', subscribed: false, titles: ['Investing for beginners: index funds', 'How to save money on groceries', 'Crypto market crash explained', 'Personal finance budget tips'] },
  { name: 'Sneaker Brand', id: 'UCmockAdvt00000000000009', subscribed: false, titles: ['New running shoe launch'] },
];

const YT_SEARCHES = ['marathon training', 'easy pasta recipe', 'next.js tutorial', 'guided meditation', 'running shoes review', 'champions league highlights', 'budget meal prep'];
const GOOGLE_SEARCHES = ['weather tomorrow', 'half marathon near me', 'how long to boil eggs', 'typescript record type', 'best index funds', 'train times', 'election results', 'yoga mat reviews'];

/** Deterministic PRNG (mulberry32) so the same job id always yields the same archive. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function videoId(r: () => number): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let s = '';
  for (let i = 0; i < 11; i++) s += abc[Math.floor(r() * abc.length)];
  return s;
}

const q = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');

export interface MyActivityRecord {
  header: string;
  title: string;
  titleUrl?: string;
  subtitles?: { name: string; url?: string }[];
  time: string;
  products: string[];
  details?: { name: string }[];
  activityControls?: string[];
}

/**
 * Synthetic history between `from` and `to`. Over time the mix drifts from running/cooking
 * (chosen, subscribed) towards news/gaming (served), so the analysis has something to show.
 */
export function generateMockHistory(from: Date, to: Date, seed: number): { youtube: MyActivityRecord[]; search: MyActivityRecord[] } {
  const r = rng(seed);
  const youtube: MyActivityRecord[] = [];
  const search: MyActivityRecord[] = [];
  const span = Math.max(1, to.getTime() - from.getTime());
  const days = Math.max(1, Math.ceil(span / 86_400_000));
  let n = 1;
  for (let d = 0; d < days; d++) {
    const dayStart = from.getTime() + d * 86_400_000;
    const progress = d / days;
    const perDay = 4 + Math.floor(r() * 8);
    for (let i = 0; i < perDay; i++) {
      const t = dayStart + Math.floor(r() * 86_400_000);
      if (t < from.getTime() || t > to.getTime()) continue;
      const time = new Date(t).toISOString();
      const roll = r();
      if (roll < 0.1) {
        const query = YT_SEARCHES[Math.floor(r() * YT_SEARCHES.length)];
        youtube.push({
          header: 'YouTube',
          title: `Searched for ${query}`,
          titleUrl: `https://www.youtube.com/results?search_query=${q(query)}`,
          time,
          products: ['YouTube'],
          activityControls: ['YouTube search history'],
        });
        continue;
      }
      if (roll < 0.2) {
        const query = GOOGLE_SEARCHES[Math.floor(r() * GOOGLE_SEARCHES.length)];
        search.push({ header: 'Search', title: `Searched for ${query}`, titleUrl: `https://www.google.com/search?q=${q(query)}`, time, products: ['Search'], activityControls: ['Web & App Activity'] });
        continue;
      }
      // Early: mostly chosen channels; later: more news / football / gaming.
      const drift = r() < 0.25 + progress * 0.45;
      const pool = drift ? CHANNELS.slice(3, 6) : [CHANNELS[0], CHANNELS[1], CHANNELS[2], CHANNELS[6], CHANNELS[7]];
      const isAd = r() < 0.03;
      const ch = isAd ? CHANNELS[8] : pool[Math.floor(r() * pool.length)];
      const title = ch.titles[Math.floor(r() * ch.titles.length)].replace('{n}', String(n++ % 40 + 1));
      const short = r() < 0.15;
      const vid = videoId(r);
      const rec: MyActivityRecord = {
        header: 'YouTube',
        title: `Watched ${title}`,
        titleUrl: short ? `https://www.youtube.com/shorts/${vid}` : `https://www.youtube.com/watch?v=${vid}`,
        subtitles: [{ name: ch.name, url: `https://www.youtube.com/channel/${ch.id}` }],
        time,
        products: ['YouTube'],
        activityControls: ['YouTube watch history'],
      };
      if (isAd) rec.details = [{ name: 'From Google Ads' }];
      youtube.push(rec);
    }
  }
  // My Activity lists newest first.
  const byTimeDesc = (a: MyActivityRecord, b: MyActivityRecord) => b.time.localeCompare(a.time);
  return { youtube: youtube.sort(byTimeDesc), search: search.sort(byTimeDesc) };
}

export function mockSubscriptionsCsv(): string {
  const rows = CHANNELS.filter((c) => c.subscribed).map((c) => `${c.id},http://www.youtube.com/channel/${c.id},${c.name}`);
  return ['Channel Id,Channel Url,Channel Title', ...rows].join('\n') + '\n';
}

export const MOCK_PATHS = {
  youtube: 'Portability/My Activity/YouTube/MyActivity.json',
  search: 'Portability/My Activity/Search/MyActivity.json',
  subscriptions: 'Portability/YouTube and YouTube Music/subscriptions/subscriptions.csv',
} as const;

/** Builds the zip for a mock job. Full exports cover 180 days; incremental ones start at job.s. */
export function buildMockArchive(job: MockJob): Uint8Array {
  const to = new Date(job.t);
  const from = job.s ? new Date(job.s) : new Date(job.t - 180 * 86_400_000);
  const seed = Math.floor(job.t / 1000) ^ 0x5eed;
  const files: Record<string, Uint8Array> = {};
  const hist = generateMockHistory(from, to, seed);
  if (job.r.includes('myactivity.youtube')) files[MOCK_PATHS.youtube] = strToU8(JSON.stringify(hist.youtube, null, 2));
  if (job.r.includes('myactivity.search')) files[MOCK_PATHS.search] = strToU8(JSON.stringify(hist.search, null, 2));
  if (job.r.includes('youtube.subscriptions')) files[MOCK_PATHS.subscriptions] = strToU8(mockSubscriptionsCsv());
  return zipSync(files, { level: 6, mtime: to });
}
