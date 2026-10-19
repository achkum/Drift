import { describe, expect, it } from 'vitest';
import { buildSharedSummary } from './summary';
import { aboutPerson, answerAboutMember, insightsFromSummary, suggestedAboutMember } from './ask';
import { CANARIES, teenInsights } from './testFixtures';

describe('Ask Drift about a member', () => {
  it('answers only from the shared summary and reports the categories used', () => {
    const s = buildSharedSummary(teenInsights(), ['trends', 'sources', 'questions']);
    const a = answerAboutMember('What is Maya’s feed pushing most?', s, 'Maya');
    expect(a.paragraphs.join(' ')).toMatch(/Maya/);
    expect(a.paragraphs.join(' ')).not.toMatch(/\byour\b/i);
    expect(a.categories.every((c) => s.categories.includes(c))).toBe(true);
    expect(a.categories.length).toBeGreaterThan(0);
    const all = JSON.stringify(insightsFromSummary(s));
    for (const c of CANARIES) expect(all).not.toContain(c);
  });

  it('cannot use a category that was not shared', () => {
    const s = buildSharedSummary(teenInsights(), ['trends', 'questions']);
    const a = answerAboutMember('Who targets Maya with ads?', s, 'Maya');
    expect(a.categories).not.toContain('ads');
    expect(insightsFromSummary(s).ads.advertisers).toEqual([]);
    expect(suggestedAboutMember(s, 'Maya').some((q) => /ads/.test(q))).toBe(false);
  });

  it('rewrites second person into the member’s name', () => {
    expect(aboutPerson('About 80% of your viewing was served to you. You follow it.', 'Sam'))
      .toBe('About 80% of Sam\'s viewing was served to Sam. Sam follows it.');
  });
});
