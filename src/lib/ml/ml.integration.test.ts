// Opt-in: downloads the real model (~130 MB, cached under node_modules/@huggingface/transformers/.cache).
// Run with:  RUN_ML=1 npx vitest run src/lib/ml/ml.integration.test.ts
import { describe, expect, it } from 'vitest';
import { createKeywordClassifier } from '@/lib/analysis';
import { createMlClassifierWith } from './core';
import { MODEL_PREFIX, loadEmbedder } from './model';
import { HELD_OUT, LABELLED, type LabelledItem } from './__fixtures__/labelled';

const RUN = process.env.RUN_ML === '1';

function accuracy(set: LabelledItem[], got: { topic: string }[], lang?: 'en' | 'sv') {
  let n = 0, ok = 0;
  set.forEach((x, i) => {
    if (lang && x.lang !== lang) return;
    n++;
    if (got[i].topic === x.topic) ok++;
  });
  return { ok, n, pct: Math.round((ok / n) * 1000) / 10 };
}

describe.skipIf(!RUN)('ML classifier with the real model', () => {
  it('beats the keyword classifier on hand-labelled EN + SV titles', async () => {
    const t0 = Date.now();
    const { embed } = await loadEmbedder(() => {}, 'cpu');
    const ml = await createMlClassifierWith(embed, { prefix: MODEL_PREFIX });
    const kw = createKeywordClassifier();
    console.log(`model + prototypes ready in ${Date.now() - t0} ms`);

    for (const [name, set] of [['tuning set', LABELLED], ['held-out set', HELD_OUT]] as const) {
      const items = set.map(({ title, channel, query }) => ({ title, channel, query }));
      const k = await kw.classify(items);
      const m = await ml.classify(items);
      const row = (r: { topic: string }[]) =>
        `all ${JSON.stringify(accuracy(set, r))} en ${JSON.stringify(accuracy(set, r, 'en'))} sv ${JSON.stringify(accuracy(set, r, 'sv'))}`;
      console.log(`${name} (${set.length})\n  keyword: ${row(k)}\n  ml:      ${row(m)}`);
      expect(accuracy(set, m).pct).toBeGreaterThan(accuracy(set, k).pct);
    }
  }, 600_000);

  it('measures throughput on unique titles', async () => {
    const { embed } = await loadEmbedder(() => {}, 'cpu');
    const ml = await createMlClassifierWith(embed, { prefix: MODEL_PREFIX, batchSize: 64 });
    const base = [...LABELLED, ...HELD_OUT].map((x) => x.title ?? '');
    const items = Array.from({ length: 2000 }, (_, i) => ({ title: `${base[i % base.length]} #${i}` }));
    const t0 = Date.now();
    await ml.classify(items);
    const s = (Date.now() - t0) / 1000;
    console.log(`2000 unique titles in ${s.toFixed(1)} s (${Math.round(2000 / s)} titles/s, node onnxruntime cpu)`);
  }, 600_000);
});
