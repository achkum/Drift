import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DriftEvent, ImportRecord, Insights } from '@/lib/types';
import {
  addAdvertisers, addEvents, addFollows, addImports, addInterests, clearAll, countEvents,
  getAllEvents, getAllImports, loadInsights, readAll, saveInsights,
} from './index';

const ev = (id: string, time: string): DriftEvent => ({ id, platform: 'youtube', kind: 'watch', time, title: id });

describe('store', () => {
  beforeEach(async () => { await clearAll(); });

  it('adds events with dedupe and returns the count of new ones', async () => {
    expect(await addEvents([ev('a', '2026-01-02T00:00:00Z'), ev('b', '2026-01-01T00:00:00Z'), ev('a', '2026-01-02T00:00:00Z')])).toBe(2);
    expect(await addEvents([ev('b', '2026-01-01T00:00:00Z'), ev('c', '2026-01-03T00:00:00Z')])).toBe(1);
    expect(await addEvents([])).toBe(0);
    expect(await countEvents()).toBe(3);
    // Read back ordered by time.
    expect((await getAllEvents()).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('merges follows, interests and advertisers without duplicates', async () => {
    await addFollows([{ platform: 'youtube', name: 'Chan' }, { platform: 'youtube', name: 'chan' }]);
    await addInterests([{ platform: 'youtube', interests: ['Cars', 'Food'] }]);
    await addInterests([{ platform: 'youtube', interests: ['food', 'Travel'] }]);
    await addAdvertisers([{ platform: 'instagram', name: 'Acme', count: 3 }]);
    await addAdvertisers([{ platform: 'instagram', name: 'Acme', count: 3 }]);
    const all = await readAll();
    expect(all.follows).toHaveLength(1);
    expect(all.interests).toEqual([{ platform: 'youtube', interests: ['Cars', 'Food', 'Travel'] }]);
    expect(all.advertisers).toEqual([{ platform: 'instagram', name: 'Acme', count: 3 }]);
  });

  it('stores insights and imports, and clears everything', async () => {
    await addEvents([ev('a', '2026-01-01T00:00:00Z')]);
    await saveInsights({ generatedAt: 'x' } as Insights);
    const rec: ImportRecord = { id: 'r1', platform: 'youtube', importedAt: '2026-01-01T00:00:00Z', fileName: 'a.zip', events: 1, newEvents: 1, warnings: [] };
    const rec2: ImportRecord = { ...rec, id: 'r2', importedAt: '2026-02-01T00:00:00Z' };
    await addImports([rec, rec2]);
    expect((await loadInsights())?.generatedAt).toBe('x');
    expect((await getAllImports()).map((r) => r.id)).toEqual(['r2', 'r1']);

    await clearAll();
    expect(await countEvents()).toBe(0);
    expect(await loadInsights()).toBeNull();
    expect(await getAllImports()).toEqual([]);
    const all = await readAll();
    expect(all.events.length + all.follows.length + all.interests.length + all.advertisers.length).toBe(0);
  });
});
