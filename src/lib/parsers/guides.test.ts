import { describe, expect, it } from 'vitest';
import { exportGuides } from './guides';

describe('export guides', () => {
  it('has complete guides for every platform', () => {
    for (const [key, g] of Object.entries(exportGuides)) {
      expect(g.platform).toBe(key);
      expect(g.intro.length).toBeGreaterThan(20);
      expect(g.steps.length).toBeGreaterThanOrEqual(5);
      expect(g.waitTime).not.toBe('');
      expect(g.uploadHint).not.toBe('');
      expect(g.startUrl).toMatch(/^https:\/\//);
      expect(g.steps.join(' ')).toMatch(/\*\*JSON\*\*/);
      for (const s of g.steps) expect(s.split('**').length % 2).toBe(1); // balanced bold markers
    }
  });

  it('youtube guide covers the Takeout choices', () => {
    const text = exportGuides.youtube.steps.join(' ');
    for (const label of ['Deselect all', 'YouTube and YouTube Music', 'All YouTube data included', 'Multiple formats', 'Send download link via email', 'Export once', '.zip', '2 GB']) {
      expect(text).toContain(`**${label}**`);
    }
    expect(exportGuides.youtube.notes.join(' ')).toMatch(/Google Search/);
  });
});
