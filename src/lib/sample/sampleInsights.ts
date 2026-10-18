// OWNER: UI agent. Sample Insights matching the wireframe, shown before the user uploads anything.
import type { Insights } from '@/lib/types';

export const sampleInsights: Insights = {
  generatedAt: '2026-10-18T00:00:00Z',
  months: [],
  platforms: [],
  totals: { items: 0, watches: 0, searches: 0 },
  headline: { title: '', detail: '' },
  monthly: [],
  rising: [],
  falling: [],
  chosen: { windowDays: 30, chosenPct: 0, servedPct: 0, byPlatform: [] },
  turningPoints: [],
  topics: {},
  range: { monthThen: '', topicsThen: 0, monthNow: '', topicsNow: 0, narrowing: false },
  platformInterests: [],
  actualTopics: [],
  ads: { advertisers: [], adItems: 0 },
  digest: { weekOf: '', lines: [] },
};
