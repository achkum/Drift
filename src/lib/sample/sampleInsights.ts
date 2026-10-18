// OWNER: UI agent. Sample Insights matching the wireframe, shown before the user uploads anything.
import type { Insights, Origin, Platform, TopicDetail } from '@/lib/types';

/** 24 months, oldest first: 2024-11 … 2026-10. */
const MONTHS: string[] = (() => {
  const out: string[] = [];
  let y = 2024;
  let m = 11;
  for (let i = 0; i < 24; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
})();

// Share of viewing per month (percent). Last six values are May to October 2026.
const POLITICS = [4, 4, 5, 4, 4, 5, 5, 4, 5, 5, 6, 5, 5, 6, 5, 6, 6, 6, 6, 7, 10, 15, 19, 21];
const FOOTBALL = [26, 28, 31, 30, 29, 27, 25, 24, 30, 31, 32, 33, 33, 34, 33, 32, 32, 31, 31, 30, 28, 24, 22, 20];
const COOKING = [18, 17, 17, 16, 16, 16, 15, 15, 15, 15, 14, 14, 15, 14, 14, 14, 14, 14, 14, 13, 12, 12, 11, 10];
const FITNESS = [3, 3, 3, 4, 4, 4, 5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 8, 9];
const RUNNING = [2, 2, 3, 3, 4, 5, 5, 6, 5, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7];
const OTHER = MONTHS.map((_, i) => 100 - POLITICS[i] - FOOTBALL[i] - COOKING[i] - FITNESS[i] - RUNNING[i]);

type Item = TopicDetail['recentItems'][number];

function items(rows: [string, Platform, Origin, string][]): Item[] {
  return rows.map(([title, platform, origin, time]) => ({ title, platform, origin, time }));
}

const topics: Insights['topics'] = {
  politics: {
    topic: 'politics',
    label: 'Politics',
    sensitive: true,
    shareFrom: 6,
    shareTo: 21,
    fromMonth: '2026-05',
    toMonth: '2026-10',
    servedPct: 81,
    itemCount: 179,
    sources: [
      { name: 'The Morning Ledger', platform: 'youtube', count: 48, origin: 'served', subscribed: false },
      { name: '@hottakes.daily', platform: 'tiktok', count: 112, origin: 'served', subscribed: false },
      { name: 'Civic Desk', platform: 'youtube', count: 19, origin: 'chosen', subscribed: true },
    ],
    recentItems: items([
      ['Five things that happened in parliament this week', 'youtube', 'served', '2026-10-17T19:42:00Z'],
      ['Budget vote explained in 60 seconds', 'tiktok', 'served', '2026-10-17T08:12:00Z'],
      ['The debate everyone is talking about', 'tiktok', 'served', '2026-10-16T21:03:00Z'],
      ['Civic Desk: what the new housing bill changes', 'youtube', 'chosen', '2026-10-15T18:30:00Z'],
      ['Reaction: the minister walks out', 'youtube', 'served', '2026-10-14T22:15:00Z'],
      ['Why polls disagree this autumn', 'youtube', 'served', '2026-10-13T20:01:00Z'],
      ['Street interviews: what voters want', 'tiktok', 'served', '2026-10-12T12:44:00Z'],
      ['Morning Ledger live: Sunday briefing', 'youtube', 'served', '2026-10-11T07:58:00Z'],
      ['Civic Desk explains: coalition maths', 'youtube', 'chosen', '2026-10-09T19:20:00Z'],
      ['The clip that went viral this week', 'tiktok', 'served', '2026-10-08T23:10:00Z'],
    ]),
  },
  football: {
    topic: 'football',
    label: 'Football',
    sensitive: false,
    shareFrom: 31,
    shareTo: 20,
    fromMonth: '2026-05',
    toMonth: '2026-10',
    servedPct: 42,
    itemCount: 248,
    sources: [
      { name: 'Matchday Highlights', platform: 'youtube', count: 96, origin: 'chosen', subscribed: true },
      { name: 'Tactics Board', platform: 'youtube', count: 41, origin: 'chosen', subscribed: true },
      { name: '@goalclips', platform: 'tiktok', count: 64, origin: 'served', subscribed: false },
    ],
    recentItems: items([
      ['Saturday highlights: all the goals', 'youtube', 'chosen', '2026-10-18T17:55:00Z'],
      ['Tactics Board: why the high press failed', 'youtube', 'chosen', '2026-10-16T20:40:00Z'],
      ['Best saves of the month', 'tiktok', 'served', '2026-10-14T13:22:00Z'],
      ['Transfer rumours round-up', 'youtube', 'served', '2026-10-11T09:05:00Z'],
    ]),
  },
  cooking: {
    topic: 'cooking',
    label: 'Cooking',
    sensitive: false,
    shareFrom: 14,
    shareTo: 10,
    fromMonth: '2026-05',
    toMonth: '2026-10',
    servedPct: 35,
    itemCount: 121,
    sources: [
      { name: 'Weeknight Kitchen', platform: 'youtube', count: 58, origin: 'chosen', subscribed: true },
      { name: '@fifteenminutemeals', platform: 'instagram', count: 22, origin: 'served', subscribed: false },
    ],
    recentItems: items([
      ['One-pan lemon chicken', 'youtube', 'chosen', '2026-10-15T17:10:00Z'],
      ['Three sauces you can freeze', 'instagram', 'served', '2026-10-10T18:45:00Z'],
    ]),
  },
  fitness: {
    topic: 'fitness',
    label: 'Fitness',
    sensitive: false,
    shareFrom: 3,
    shareTo: 9,
    fromMonth: '2026-05',
    toMonth: '2026-10',
    servedPct: 47,
    itemCount: 64,
    sources: [
      { name: 'Strong at Home', platform: 'youtube', count: 27, origin: 'chosen', subscribed: true },
      { name: '@mobilitydaily', platform: 'tiktok', count: 21, origin: 'served', subscribed: false },
    ],
    recentItems: items([
      ['20 minute full body workout, no equipment', 'youtube', 'chosen', '2026-10-17T06:30:00Z'],
      ['Stretch this before you run', 'tiktok', 'served', '2026-10-12T07:02:00Z'],
    ]),
  },
  running: {
    topic: 'running',
    label: 'Running',
    sensitive: false,
    shareFrom: 6,
    shareTo: 7,
    fromMonth: '2026-05',
    toMonth: '2026-10',
    servedPct: 30,
    itemCount: 52,
    sources: [
      { name: 'searches for "marathon training"', platform: 'google_search', count: 14, origin: 'chosen', subscribed: false },
      { name: 'Long Run Club', platform: 'youtube', count: 23, origin: 'chosen', subscribed: true },
    ],
    recentItems: items([
      ['Marathon training week 6', 'youtube', 'chosen', '2026-10-16T06:10:00Z'],
    ]),
  },
};

export const sampleInsights: Insights = {
  generatedAt: '2026-10-18T00:00:00Z',
  months: MONTHS,
  platforms: [
    { platform: 'youtube', items: 812, from: '2024-11-02T00:00:00Z', to: '2026-10-18T00:00:00Z' },
    { platform: 'google_search', items: 214, from: '2024-11-03T00:00:00Z', to: '2026-10-17T00:00:00Z' },
    { platform: 'tiktok', items: 196, from: '2025-06-11T00:00:00Z', to: '2026-10-17T00:00:00Z' },
    { platform: 'instagram', items: 18, from: '2026-02-20T00:00:00Z', to: '2026-10-10T00:00:00Z' },
  ],
  totals: { items: 1240, watches: 978, searches: 214 },

  headline: {
    title: 'Your feed drifted toward politics',
    detail: 'Moderate shift, based on 1,240 videos and searches',
    topic: 'politics',
  },

  monthly: [
    { topic: 'politics', label: 'Politics', shares: POLITICS },
    { topic: 'football', label: 'Football', shares: FOOTBALL },
    { topic: 'cooking', label: 'Cooking', shares: COOKING },
    { topic: 'fitness', label: 'Fitness', shares: FITNESS },
    { topic: 'running', label: 'Running', shares: RUNNING },
    { topic: 'other', label: 'Other', shares: OTHER },
  ],

  rising: [
    { topic: 'politics', label: 'Politics', from: 6, to: 21, delta: 15 },
    { topic: 'fitness', label: 'Fitness', from: 3, to: 9, delta: 6 },
  ],
  falling: [
    { topic: 'football', label: 'Football', from: 31, to: 20, delta: -11 },
    { topic: 'cooking', label: 'Cooking', from: 14, to: 10, delta: -4 },
  ],

  chosen: {
    windowDays: 30,
    chosenPct: 38,
    servedPct: 62,
    byPlatform: [
      { platform: 'youtube', chosenPct: 44, items: 142 },
      { platform: 'google_search', chosenPct: 100, items: 31 },
      { platform: 'tiktok', chosenPct: 12, items: 88 },
    ],
  },

  turningPoints: [
    {
      month: '2026-07',
      topic: 'politics',
      label: 'Politics',
      direction: 'up',
      explanation: "Mostly served to you after news clips autoplayed. You didn't search for it.",
    },
    {
      month: '2026-08',
      topic: 'fitness',
      label: 'Fitness',
      direction: 'up',
      explanation: 'Picked up after you subscribed to a home workout channel.',
    },
    {
      month: '2026-05',
      topic: 'football',
      label: 'Football',
      direction: 'down',
      explanation: 'Fewer searches from you after the season ended.',
    },
  ],

  topics,

  range: { monthThen: '2026-03', topicsThen: 9, monthNow: '2026-10', topicsNow: 5, narrowing: true },

  platformInterests: [
    {
      platform: 'instagram',
      interests: [
        { name: 'Running', matches: true },
        { name: 'Cooking', matches: true },
        { name: 'Luxury travel', matches: false },
        { name: 'Home loans', matches: false },
        { name: 'Parenting', matches: false },
      ],
    },
  ],
  actualTopics: ['Football', 'Politics', 'Cooking', 'Running', 'Fitness'],

  ads: {
    advertisers: [
      { platform: 'instagram', name: 'Northwind News app', count: 18 },
      { platform: 'instagram', name: 'Streamly', count: 12 },
      { platform: 'instagram', name: 'Harbor Home Loans', count: 9 },
    ],
    adItems: 39,
    tactics: [
      { id: 'fake_urgency', label: 'Fake urgency', count: 8, examples: ['Last chance: offer ends tonight'] },
      { id: 'fake_discount', label: 'Fake discounts', count: 6, examples: ['70% off everything, today only'] },
    ],
  },

  digest: {
    weekOf: '2026-10-12',
    lines: [
      'Politics was 23% of your viewing this week, up from 20% the week before.',
      'You chose about 4 in 10 videos. Most of the rest autoplayed on YouTube.',
      'Football picked up on Saturday, after you searched for match highlights.',
    ],
  },
};
