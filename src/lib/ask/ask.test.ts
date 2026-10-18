import { describe, expect, it } from 'vitest';
import type { Insights } from '@/lib/types';
import { sampleInsights } from '@/lib/sample/sampleInsights';
import { answerQuestion, suggestedQuestions } from './index';

const insights: Insights = {
  generatedAt: '2026-10-18T00:00:00Z',
  months: ['2026-01', '2026-02', '2026-03'],
  platforms: [{ platform: 'youtube', items: 1200, from: '2026-01-01', to: '2026-03-31' }],
  totals: { items: 1200, watches: 1000, searches: 200 },
  headline: { title: 'Politics took over your feed.', detail: 'It went from 4% to 22%.', topic: 'politics' },
  monthly: [{ topic: 'politics', label: 'Politics', shares: [4, 12, 22] }],
  rising: [{ topic: 'politics', label: 'Politics', from: 4, to: 22, delta: 18 }],
  falling: [{ topic: 'football', label: 'Football', from: 30, to: 12, delta: -18 }],
  chosen: {
    windowDays: 30, chosenPct: 38, servedPct: 62,
    byPlatform: [{ platform: 'youtube', chosenPct: 35, items: 300 }, { platform: 'tiktok', chosenPct: 10, items: 90 }],
  },
  turningPoints: [{ month: '2026-02', topic: 'politics', label: 'Politics', direction: 'up', explanation: 'Mostly served after news clips autoplayed.' }],
  topics: {
    politics: {
      topic: 'politics', label: 'Politics', sensitive: true, shareFrom: 4, shareTo: 22, fromMonth: '2026-01', toMonth: '2026-03',
      servedPct: 81, itemCount: 240,
      sources: [{ name: 'News Clips Daily', platform: 'youtube', count: 90, origin: 'served', subscribed: false }],
      recentItems: [],
    },
    football: {
      topic: 'football', label: 'Football', sensitive: false, shareFrom: 30, shareTo: 12, fromMonth: '2026-01', toMonth: '2026-03',
      servedPct: 20, itemCount: 300, sources: [], recentItems: [],
    },
  },
  range: { monthThen: '2026-01', topicsThen: 7, monthNow: '2026-03', topicsNow: 4, narrowing: true },
  platformInterests: [{ platform: 'youtube', interests: [{ name: 'Cars', matches: false }, { name: 'Football', matches: true }] }],
  actualTopics: ['Football', 'Politics'],
  ads: { advertisers: [{ platform: 'instagram', name: 'Acme Shoes', count: 14 }, { platform: 'instagram', name: 'Bank Co', count: 3 }], adItems: 25 },
  digest: { weekOf: '2026-03-23', lines: ['You watched 40 videos.', 'Politics was 30% of them.'] },
};

const text = (q: string) => answerQuestion(q, insights).paragraphs.join(' ');

describe('suggestedQuestions', () => {
  it('builds 3-5 questions from the data', () => {
    const qs = suggestedQuestions(insights);
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(qs[0]).toBe('Why did politics rise for me?');
    expect(qs).toContain('How much of my viewing did I choose?');
  });

  it('still suggests something with empty insights', () => {
    expect(suggestedQuestions(sampleInsights).length).toBeGreaterThanOrEqual(3);
  });

  it('every suggested question gets a real (non-fallback) answer', () => {
    for (const q of suggestedQuestions(insights)) {
      expect(answerQuestion(q, insights).basis).not.toMatch(/only answers from/);
    }
  });
});

describe('answerQuestion', () => {
  it('explains a rising topic with numbers from Insights', () => {
    const a = answerQuestion('Why did politics rise for me?', insights);
    expect(a.basis).toBe('Based on your trends and sources.');
    expect(a.paragraphs.length).toBeLessThanOrEqual(2);
    const t = a.paragraphs.join(' ');
    expect(t).toContain('4%');
    expect(t).toContain('22%');
    expect(t).toContain('81%');
    expect(t).toContain('News Clips Daily');
    expect(t).toContain('February 2026');
  });

  it('matches loose topic words and Swedish', () => {
    expect(text('why am I seeing so much political stuff')).toContain('Politics');
    expect(text('Varför ökade politik?')).toContain('81%');
    expect(text('what happened to football?')).toContain('30%');
  });

  it('answers chosen vs served honestly', () => {
    const a = answerQuestion('How much of my viewing did I choose?', insights);
    const t = a.paragraphs.join(' ');
    expect(t).toContain('38%');
    expect(t).toContain('62%');
    expect(t).toMatch(/estimate/);
    expect(t).toContain('TikTok 10% chosen');
    expect(a.basis).toMatch(/estimate/);
    expect(text('Hur mycket valde jag själv?')).toContain('38%');
  });

  it('answers what the feed pushes most', () => {
    expect(text('What is my feed pushing most?')).toMatch(/^Politics is what your feed pushes most: 240 items/);
  });

  it('answers what I could change', () => {
    const t = text('What could I change?');
    expect(t).toContain('Politics');
    expect(t).toContain('62%');
    expect(t).toContain('from 7 to 4 topics');
  });

  it('answers this week from the digest', () => {
    const a = answerQuestion('What changed this week?', insights);
    expect(a.paragraphs.join(' ')).toContain('You watched 40 videos.');
    expect(a.basis).toMatch(/weekly digest/);
  });

  it('answers ads in English and Swedish', () => {
    expect(text('Who targets me with ads?')).toContain('Acme Shoes (14)');
    expect(text('vem visar reklam för mig')).toContain('25 items');
  });

  it('answers interests and range', () => {
    expect(text('How does YouTube see me?')).toMatch(/1 of them match/);
    expect(text('Am I in a bubble?')).toMatch(/narrowed: in January 2026, 7 topics/);
  });

  it('falls back helpfully', () => {
    const a = answerQuestion('what is the weather tomorrow', insights);
    expect(a.paragraphs[0]).toMatch(/couldn't match/);
    expect(a.paragraphs[1]).toContain('Why did politics rise for me?');
    expect(answerQuestion('', insights).paragraphs[0]).toMatch(/couldn't match/);
  });

  it('is honest when there is no data', () => {
    const a = answerQuestion('Why did politics rise for me?', sampleInsights);
    expect(a.paragraphs[0]).toMatch(/no data/);
    expect(a.paragraphs.join(' ')).not.toMatch(/\d+%/);
  });

  it('never prints numbers that are not in Insights for sparse data', () => {
    const sparse: Insights = { ...sampleInsights, totals: { items: 5, watches: 5, searches: 0 } };
    for (const q of ['What is my feed pushing most?', 'Who targets me with ads?', 'What changed this week?', 'Am I in a bubble?', 'What could I change?']) {
      const a = answerQuestion(q, sparse);
      expect(a.paragraphs.length).toBeGreaterThan(0);
      expect(a.paragraphs.join(' ')).not.toMatch(/NaN|undefined/);
    }
  });
});
