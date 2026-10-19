// OWNER: household agent. Test fixtures (used only by *.test.ts).
import type { Insights, TopicDetail } from '@/lib/types';

/** Strings that must never appear in anything shared. */
export const CANARIES = [
  'SECRET-TITLE-what-i-eat-in-a-day-750kcal',
  'https://www.youtube.com/watch?v=CANARY123',
  'SECRET-TITLE-gaming-stream-recording',
  'https://www.tiktok.com/@x/video/CANARY456',
  'SECRET-SEARCH-how-to-skip-meals',
];

function detail(topic: string, label: string, sensitive: boolean, itemCount: number, servedPct: number, sources: TopicDetail['sources'], titles: [string, string?][]): TopicDetail {
  return {
    topic, label, sensitive, shareFrom: 0, shareTo: 0, fromMonth: '2026-05', toMonth: '2026-10', servedPct, itemCount, sources,
    recentItems: titles.map(([title, url], i) => ({ title, url, time: `2026-10-${String(10 + i).padStart(2, '0')}T12:00:00Z`, origin: 'served', platform: 'youtube' })),
  };
}

/** A teen whose feed drifted toward dieting (like Maya in the wireframe). */
export function teenInsights(): Insights {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const gaming = [34, 33, 32, 30, 29, 27];
  const fitness = [8, 9, 12, 16, 19, 22];
  const dieting = [1, 1, 2, 6, 12, 19];
  const music = [20, 19, 18, 17, 16, 15];
  const other = months.map((_, i) => 100 - gaming[i] - fitness[i] - dieting[i] - music[i]);
  return {
    generatedAt: '2026-10-18T00:00:00Z',
    months,
    platforms: [{ platform: 'youtube', items: 900, from: '2026-05-01T00:00:00Z', to: '2026-10-18T00:00:00Z' }],
    totals: { items: 900, watches: 860, searches: 40 },
    headline: { title: 'Your feed drifted toward dieting and weight loss', detail: 'Big shift', topic: 'dieting' },
    monthly: [
      { topic: 'gaming', label: 'Gaming', shares: gaming },
      { topic: 'fitness', label: 'Fitness and training', shares: fitness },
      { topic: 'dieting', label: 'Dieting and weight loss', shares: dieting },
      { topic: 'music', label: 'Music', shares: music },
      { topic: 'other', label: 'Other', shares: other },
    ],
    rising: [
      { topic: 'dieting', label: 'Dieting and weight loss', from: 1, to: 19, delta: 18 },
      { topic: 'fitness', label: 'Fitness and training', from: 8, to: 22, delta: 14 },
    ],
    falling: [{ topic: 'gaming', label: 'Gaming', from: 34, to: 27, delta: -7 }],
    chosen: { windowDays: 30, chosenPct: 21, servedPct: 79, byPlatform: [{ platform: 'youtube', chosenPct: 28, items: 300 }] },
    turningPoints: [{ month: '2026-08', topic: 'dieting', label: 'Dieting and weight loss', direction: 'up', explanation: `Started after ${CANARIES[0]}` }],
    topics: {
      gaming: detail('gaming', 'Gaming', false, 240, 50, [{ name: 'Pixel Plays', platform: 'youtube', count: 80, origin: 'chosen', subscribed: true }], [[CANARIES[2], CANARIES[3]]]),
      fitness: detail('fitness', 'Fitness and training', false, 150, 85, [
        { name: '[Fitness channel A]', platform: 'youtube', count: 34, origin: 'served', subscribed: false },
        { name: '[Account B]', platform: 'tiktok', count: 21, origin: 'served', subscribed: false },
      ], [['Leg day for beginners']]),
      dieting: detail('dieting', 'Dieting and weight loss', true, 61, 90, [
        { name: 'SECRET-DIET-CHANNEL', platform: 'youtube', count: 30, origin: 'served', subscribed: false },
      ], [[CANARIES[0], CANARIES[1]]]),
      music: detail('music', 'Music', false, 120, 60, [], [['Top hits this week']]),
    },
    range: { monthThen: '2026-05', topicsThen: 7, monthNow: '2026-10', topicsNow: 5, narrowing: true },
    platformInterests: [{ platform: 'instagram', interests: [
      { name: 'Fitness', matches: true }, { name: 'Weight loss', matches: true }, { name: 'Gaming', matches: true },
    ] }],
    actualTopics: ['Gaming', 'Fitness and training', 'Dieting and weight loss', 'Music'],
    ads: { advertisers: [{ platform: 'instagram', name: '[Supplement brand A]', count: 14 }, { platform: 'instagram', name: '[Sportswear brand C]', count: 18 }], adItems: 41 },
    digest: {
      weekOf: '2026-10-12',
      lines: [
        'You watched 120 videos, 10 more than the week before.',
        'Most watched: dieting and weight loss, 21% of your viewing (18% the week before).',
        'You chose 20% of what you watched (25% the week before). The rest was served.',
        `You watched "${CANARIES[2]}" twice.`,
        `See ${CANARIES[3]}`,
        `Football picked up after you searched for ${CANARIES[4]}.`,
        'New in your feed: [Account B] (12 videos).',
      ],
    },
  };
}

/** An adult with a stable feed and a politics rise (never a safety alert). */
export function adultInsights(): Insights {
  const t = teenInsights();
  return {
    ...t,
    monthly: [
      { topic: 'politics', label: 'Politics and news', shares: [6, 7, 10, 15, 19, 21] },
      { topic: 'football', label: 'Football', shares: [31, 30, 28, 24, 22, 20] },
      { topic: 'other', label: 'Other', shares: [63, 63, 62, 61, 59, 59] },
    ],
    rising: [{ topic: 'politics', label: 'Politics and news', from: 6, to: 21, delta: 15 }],
    falling: [{ topic: 'football', label: 'Football', from: 31, to: 20, delta: -11 }],
    topics: {
      politics: detail('politics', 'Politics and news', true, 179, 81, [{ name: 'The Morning Ledger', platform: 'youtube', count: 48, origin: 'served', subscribed: false }], [['Budget vote explained']]),
      football: detail('football', 'Football', false, 248, 42, [{ name: 'Matchday Highlights', platform: 'youtube', count: 96, origin: 'chosen', subscribed: true }], [['Saturday highlights']]),
    },
    digest: { weekOf: '2026-10-12', lines: ['You watched 80 videos.'] },
  };
}
