import { describe, expect, it, vi } from 'vitest';
import type { ImportProgress } from '@/lib/types';
import { TOPICS } from '@/lib/analysis';
import { createMlClassifierWith, decide, DEFAULT_TUNING, itemText, softmax, type EmbedFn } from './core';
import { PROTOTYPES } from './prototypes';

vi.mock('@huggingface/transformers', () => ({
  env: {},
  pipeline: async () => { throw new Error('offline'); },
}));

const IDS = TOPICS.map((t) => t.id).filter((id) => id !== 'other' && id !== 'unknown');
const DIM = IDS.length;
const PROTO_TOPIC = new Map<string, number>();
for (const [id, sentences] of Object.entries(PROTOTYPES)) for (const s of sentences) PROTO_TOPIC.set(s, IDS.indexOf(id));

/**
 * Fake embedding: prototype sentences and texts containing "{{i}}" are one-hot on topic i;
 * anything else is a flat vector (equally, weakly similar to every topic).
 */
function fakeEmbed() {
  const calls: string[][] = [];
  const embed: EmbedFn = async (texts) => {
    calls.push(texts);
    return texts.map((raw) => {
      const t = raw.replace(/^query: /, '');
      const v = new Float32Array(DIM);
      const m = /\{\{(\d+)\}\}/.exec(t);
      const idx = PROTO_TOPIC.get(t) ?? (m ? Number(m[1]) : -1);
      if (idx >= 0) v[idx] = 1;
      else v.fill(1 / Math.sqrt(DIM));
      return v;
    });
  };
  return { embed, calls, itemCalls: () => calls.filter((b) => b.every((t) => !PROTO_TOPIC.has(t.replace(/^query: /, '')))) };
}

const tag = (id: string) => `{{${IDS.indexOf(id)}}}`;

describe('itemText', () => {
  it('uses the query, else title plus channel', () => {
    expect(itemText({ query: '  how  to bake ' })).toBe('how to bake');
    expect(itemText({ title: 'A title', channel: 'Chan' })).toBe('A title (Chan)');
    expect(itemText({ channel: 'Only channel' })).toBe('Only channel');
    expect(itemText({ url: 'https://x' })).toBe('');
  });
});

describe('createMlClassifierWith', () => {
  it('returns other with confidence 0 for items without text, without embedding them', async () => {
    const f = fakeEmbed();
    const c = await createMlClassifierWith(f.embed, { prefix: 'query: ' });
    const res = await c.classify([{}, { url: 'https://www.tiktok.com/v/1' }, { title: '   ' }]);
    expect(res).toEqual([
      { topic: 'other', confidence: 0 },
      { topic: 'other', confidence: 0 },
      { topic: 'other', confidence: 0 },
    ]);
    expect(f.itemCalls()).toHaveLength(0);
  });

  it('classifies keyword-free titles by prototype similarity', async () => {
    const f = fakeEmbed();
    const c = await createMlClassifierWith(f.embed, { prefix: 'query: ' });
    const res = await c.classify([
      { title: `Vi klarade sista bossen ${tag('gaming')}` },
      { query: `älgen på vägen ${tag('animals')}` },
    ]);
    expect(res.map((r) => r.topic)).toEqual(['gaming', 'animals']);
    for (const r of res) expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('keeps strong keyword results and does not embed them', async () => {
    const f = fakeEmbed();
    const c = await createMlClassifierWith(f.embed, { prefix: 'query: ' });
    const res = await c.classify([{ title: `Premier League highlights: Arsenal vs Chelsea` }]);
    expect(res[0].topic).toBe('football');
    expect(res[0].confidence).toBeGreaterThanOrEqual(DEFAULT_TUNING.keywordStrong);
    expect(f.itemCalls()).toHaveLength(0);
  });

  it('lets the model override a weak keyword guess, and boosts agreement', async () => {
    const f = fakeEmbed();
    const c = await createMlClassifierWith(f.embed, { prefix: 'query: ' });
    // "game" is a weak/normal gaming + sports keyword; the model says sports.
    const [overridden] = await c.classify([{ title: `Game seven tonight ${tag('sports')}` }]);
    expect(overridden.topic).toBe('sports');
  });

  it("falls back to 'other' when nothing is similar enough", async () => {
    const f = fakeEmbed();
    const c = await createMlClassifierWith(f.embed, { prefix: 'query: ' });
    const [r] = await c.classify([{ title: 'Lite uppdateringar' }]);
    expect(r).toEqual({ topic: 'other', confidence: 0 });
  });

  it('dedupes texts, batches, and reports classifying progress', async () => {
    const f = fakeEmbed();
    const progress: ImportProgress[] = [];
    const c = await createMlClassifierWith(f.embed, { prefix: 'query: ', batchSize: 2, onProgress: (p) => progress.push(p) });
    const items = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ title: `${x} ${tag('music')}` }));
    const res = await c.classify([...items, ...items, ...items]);
    expect(res).toHaveLength(15);
    expect(res.every((r) => r.topic === 'music')).toBe(true);
    const batches = f.itemCalls();
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(new Set(batches.flat()).size).toBe(5);
    expect(batches.flat().every((t) => t.startsWith('query: '))).toBe(true);
    const fr = progress.filter((p) => p.stage === 'classifying').map((p) => p.fraction);
    expect(fr[0]).toBe(0);
    expect(fr[fr.length - 1]).toBe(1);
    expect([...fr].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(fr);
  });

  it('keeps output order and length aligned with input', async () => {
    const f = fakeEmbed();
    const c = await createMlClassifierWith(f.embed);
    const res = await c.classify([{ title: `x ${tag('travel')}` }, {}, { title: `y ${tag('cars')}` }]);
    expect(res.map((r) => r.topic)).toEqual(['travel', 'other', 'cars']);
  });
});

describe('decide', () => {
  const ids = ['a', 'b', 'c'];
  const t = DEFAULT_TUNING;
  it('agreement with a weak keyword vote is at least as confident as either', () => {
    const sims = Float64Array.from([0.9, 0.85, 0.8]);
    const p = softmax(sims, t.temperature)[0];
    const r = decide({ topic: 'a', confidence: 0.4 }, sims, ids, t);
    expect(r.topic).toBe('a');
    expect(r.confidence).toBeGreaterThanOrEqual(Math.max(0.4, Math.round(p * 100) / 100));
  });
  it('keeps the keyword topic when the model is unsure', () => {
    const sims = Float64Array.from([0.7, 0.7, 0.7]);
    const r = decide({ topic: 'c', confidence: 0.3 }, sims, ids, t);
    expect(r.topic).toBe('c');
    expect(r.confidence).toBeLessThan(0.4);
  });
});

describe('createMlClassifier', () => {
  it('rejects when the model cannot load, so the caller can fall back', async () => {
    const { createMlClassifier } = await import('./index');
    await expect(createMlClassifier(() => {})).rejects.toThrow();
  });
});
