// Synthetic, seeded history generators for analysis tests.
import type { DriftEvent, FollowRecord, Platform } from '@/lib/types';
import type { AnalysisInput } from '../index';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TITLES: Record<string, string[]> = {
  football: [
    'Arsenal vs Chelsea | Premier League Highlights',
    'Allsvenskan: AIK – Hammarby höjdpunkter',
    'Haaland hat trick against Liverpool',
    'Champions League quarter final recap',
    'Top 10 goals of the week',
  ],
  politics: [
    'Senate debate on the immigration bill',
    'Riksdagen: partiledardebatt om budgeten',
    'Breaking news: new tariffs on EU imports',
    'Election 2026: what the polls say',
    'President speech on NATO, full',
  ],
  fitness: [
    'Marathon training plan for beginners',
    'How to run faster: interval training',
    'Best running shoes 2026 tested',
  ],
  food: ['Easy lasagne recipe', 'Recept: kanelbullar på 30 minuter', 'Sourdough bread for beginners'],
  gaming: ['Minecraft survival lets play #12', 'Elden Ring boss fight guide', 'Fortnite ranked gameplay'],
  music: ['Taylor Swift - Official Music Video', 'Lofi beats playlist for studying', 'Avicii live concert'],
  tech: ['iPhone 17 review after one month', 'Building a gaming PC: GPU guide', 'ChatGPT vs Claude for coding'],
  travel: ['Things to do in Tokyo on a budget', 'Interrail through Italy: travel vlog', 'Best beaches in Thailand'],
  science: ['How black holes work', 'NASA James Webb telescope new images', 'Kvantfysik förklarat'],
};

export const SEARCHES = ['marathon training plan', 'running shoes', 'interval training run'];

export interface Scenario {
  input: AnalysisInput;
  /** First month of the scripted change, 'YYYY-MM'. */
  changeMonth: string;
  startMonth: string;
  months: number;
}

function pick<T>(r: () => number, xs: T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

function weighted(r: () => number, w: Record<string, number>): string {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (const [k, v] of Object.entries(w)) { x -= v; if (x <= 0) return k; }
  return Object.keys(w)[0];
}

const EARLY = { football: 30, politics: 5, food: 15, gaming: 10, music: 10, tech: 10, travel: 10, science: 5, fitness: 5 };
const LATE = { football: 8, politics: 50, food: 15, gaming: 7, music: 5, tech: 5, fitness: 10 };

/**
 * Scripted drift. From month 4 (index 3) politics rises from 5% to 50%, served from many
 * channels with no searches; football falls from 30% to 8%. Running searches every other
 * day are each followed by a running video 3 minutes later. Cooking comes from a
 * subscribed channel. One untitled TikTok watch a day, an ad every 3rd day, a like
 * on running videos now and then.
 */
export function driftScenario(opts: { seed?: number; months?: number; perDay?: number; start?: string } = {}): Scenario {
  const r = rng(opts.seed ?? 42);
  const months = opts.months ?? 9;
  const perDay = opts.perDay ?? 6;
  const start = opts.start ?? '2026-01';
  const [y0, m0] = start.split('-').map(Number);
  const events: DriftEvent[] = [];
  let n = 0;
  const yt: Platform = 'youtube';
  const add = (e: Omit<DriftEvent, 'id'>) => events.push({ ...e, id: `t:${n++}` });
  const followed: FollowRecord[] = [{ platform: 'youtube', name: 'Kitchen Stories', url: 'https://www.youtube.com/@kitchenstories' }];

  for (let mi = 0; mi < months; mi++) {
    const days = new Date(Date.UTC(y0, m0 - 1 + mi + 1, 0)).getUTCDate();
    const mix = mi >= 3 ? LATE : EARLY;
    for (let d = 1; d <= days; d++) {
      const dayStart = Date.UTC(y0, m0 - 1 + mi, d, 8);
      const step = (14 * 3600_000) / perDay;
      for (let j = 0; j < perDay; j++) {
        const t = dayStart + j * step;
        const topic = weighted(r, mix);
        if (topic === 'fitness') {
          // Searched, then watched.
          const q = pick(r, SEARCHES);
          add({ platform: 'google_search', kind: 'search', time: new Date(t).toISOString(), query: q, title: q });
          add({
            platform: yt, kind: 'watch', time: new Date(t + 3 * 60_000).toISOString(),
            title: pick(r, TITLES.fitness), channel: { name: `Run Coach ${Math.floor(r() * 20)}` },
          });
          if (r() < 0.2) add({ platform: yt, kind: 'like', time: new Date(t + 9 * 60_000).toISOString(), title: pick(r, TITLES.fitness) });
          continue;
        }
        const channel =
          topic === 'food' ? { name: 'Kitchen Stories', url: 'https://youtube.com/@KitchenStories/' }
          : topic === 'football' ? { name: pick(r, ['Sky Sports Football', 'Allsvenskan', 'Football Daily']) }
          : topic === 'politics' ? { name: `Daily Brief ${Math.floor(r() * 80)}` }
          : { name: `${topic} hub ${Math.floor(r() * 60)}` };
        add({ platform: yt, kind: 'watch', time: new Date(t).toISOString(), title: pick(r, TITLES[topic]), channel, url: `https://www.youtube.com/watch?v=${n}` });
      }
      add({ platform: 'tiktok', kind: 'watch', time: new Date(dayStart + 15 * 3600_000).toISOString(), url: `https://www.tiktokv.com/share/video/${n}/` });
      if (d % 3 === 0) add({ platform: yt, kind: 'ad', time: new Date(dayStart + 3600_000).toISOString(), title: 'Spotify Premium', fromAds: true });
    }
  }

  return {
    input: {
      events,
      follows: followed,
      interests: [{ platform: 'instagram', interests: ['Soccer', 'Politics', 'Cooking', 'Knitting', 'Hundar'] }],
      advertisers: [{ platform: 'youtube', name: 'Spotify', count: 80 }, { platform: 'youtube', name: 'Volvo', count: 120 }],
    },
    changeMonth: `${y0 + Math.floor((m0 - 1 + 3) / 12)}-${String(((m0 - 1 + 3) % 12) + 1).padStart(2, '0')}`,
    startMonth: start,
    months,
  };
}

/** TikTok-only history: watches with links only, plus a few searches. */
export function tiktokOnly(days = 40): AnalysisInput {
  const events: DriftEvent[] = [];
  for (let d = 0; d < days; d++) {
    for (let j = 0; j < 10; j++) {
      const t = Date.UTC(2026, 5, 1 + d, 18, j * 4);
      events.push({ id: `tt:${d}:${j}`, platform: 'tiktok', kind: 'watch', time: new Date(t).toISOString(), url: `https://www.tiktokv.com/share/video/${d}${j}/` });
    }
  }
  return { events, follows: [], interests: [], advertisers: [] };
}
