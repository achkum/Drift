import { describe, expect, it } from 'vitest';
import { redactAnalyticsUrl } from './analyticsUrl';

const O = 'https://drift.example';

describe('redactAnalyticsUrl', () => {
  it('replaces topic ids with the route pattern', () => {
    expect(redactAnalyticsUrl(`${O}/topic/politics`)).toBe(`${O}/topic/[id]`);
    expect(redactAnalyticsUrl(`${O}/topic/mental%20health`)).toBe(`${O}/topic/[id]`);
  });

  it('replaces household member ids but keeps the compare page', () => {
    expect(redactAnalyticsUrl(`${O}/household/maya`)).toBe(`${O}/household/[member]`);
    expect(redactAnalyticsUrl(`${O}/household/${'a'.repeat(43)}`)).toBe(`${O}/household/[member]`);
    expect(redactAnalyticsUrl(`${O}/household/compare`)).toBe(`${O}/household/compare`);
    expect(redactAnalyticsUrl(`${O}/household`)).toBe(`${O}/household`);
  });

  it('drops query strings and hashes', () => {
    expect(redactAnalyticsUrl(`${O}/household/you?as=abc123`)).toBe(`${O}/household/[member]`);
    expect(redactAnalyticsUrl(`${O}/join#invite=secret`)).toBe(`${O}/join`);
    expect(redactAnalyticsUrl(`${O}/ask?q=why+politics`)).toBe(`${O}/ask`);
  });

  it('leaves ordinary pages unchanged', () => {
    expect(redactAnalyticsUrl(`${O}/home`)).toBe(`${O}/home`);
    expect(redactAnalyticsUrl(`${O}/connect/tiktok`)).toBe(`${O}/connect/tiktok`);
  });

  it('falls back safely on a malformed url', () => {
    expect(redactAnalyticsUrl('not a url')).toBe('/');
  });
});
