import { describe, expect, it } from 'vitest';
import { TOPICS } from '@/lib/analysis';
import { LABELLED_TITLES } from './labelled-titles';
import { ADS, POOLS } from './pools';
import { oracleClassifier, runPersona } from './run';
import { PERSONAS, REASON_ORIGIN, simulate } from './simulate';

const persona = (id: string) => PERSONAS.find((p) => p.id === id)!;

describe('simulate', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const p = persona('football_to_politics');
    const a = simulate(p, 7);
    const b = simulate(p, 7);
    expect(b.input.events).toEqual(a.input.events);
    expect([...b.truth.entries()]).toEqual([...a.truth.entries()]);
    const c = simulate(p, 8);
    expect(c.input.events.map((e) => e.title)).not.toEqual(a.input.events.map((e) => e.title));
  });

  it('gives every event ground truth consistent with its kind', () => {
    for (const p of PERSONAS) {
      const sim = simulate(p, 1);
      expect(sim.input.events.length).toBeGreaterThan(50);
      for (const e of sim.input.events) {
        const gt = sim.truth.get(e.id)!;
        expect(gt).toBeDefined();
        expect(gt.origin).toBe(REASON_ORIGIN[gt.reason]);
        if (e.kind === 'search') expect(gt.reason).toBe('search');
        if (e.fromAds) expect(gt.origin).toBe('pushed');
        if (e.kind === 'like') expect(gt.origin).toBe('engaged');
        if (gt.removed) expect(e.title).toBeUndefined();
      }
    }
  });

  it('stays inside the scripted months and reports the onset', () => {
    const sim = simulate(persona('runner_to_dieting'), 3);
    const months = new Set(sim.input.events.map((e) => e.time.slice(0, 7)));
    for (const m of sim.months) expect(months.has(m)).toBe(true);
    expect(sim.onsetMonth).toBe('2026-05');
    expect(simulate(persona('gamer_stable'), 3).onsetMonth).toBeUndefined();
  });

  it('really drifts: the target topic grows after the onset', () => {
    const sim = simulate(persona('football_to_politics'), 2);
    const share = (month: string) => {
      const w = sim.input.events.filter((e) => e.kind === 'watch' && !e.fromAds && e.time.startsWith(month));
      return w.filter((e) => sim.truth.get(e.id)!.topic === 'politics').length / w.length;
    };
    expect(share('2026-02')).toBeLessThan(0.1);
    expect(share('2026-08')).toBeGreaterThan(0.3);
  });

  it('spaces autoplay 3-8 minutes after the previous watch', () => {
    const sim = simulate(persona('gamer_stable'), 4);
    const watches = sim.input.events.filter((e) => e.kind === 'watch' && !e.fromAds);
    for (let i = 1; i < watches.length; i++) {
      if (sim.truth.get(watches[i].id)!.reason !== 'autoplay') continue;
      const gap = (Date.parse(watches[i].time) - Date.parse(watches[i - 1].time)) / 60_000;
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(8);
    }
  });
});

describe('content pools', () => {
  it('assigns every title to exactly one topic, with known topic ids', () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    const seen = new Map<string, string>();
    for (const [topic, pool] of Object.entries(POOLS)) {
      expect(ids.has(topic)).toBe(true);
      for (const t of [...pool.en, ...pool.sv]) {
        expect(seen.get(t), t).toBeUndefined();
        seen.set(t, topic);
      }
    }
    for (const ad of ADS) expect(ids.has(ad.topic)).toBe(true);
    for (const main of ['football', 'politics', 'fitness', 'dieting', 'gaming', 'food', 'true_crime', 'travel', 'tech', 'music']) {
      expect(POOLS[main].en.length + POOLS[main].sv.length).toBeGreaterThanOrEqual(25);
    }
  });

  it('has ~250 unique labelled titles over valid topics, English and Swedish', () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    expect(LABELLED_TITLES.length).toBeGreaterThanOrEqual(250);
    expect(new Set(LABELLED_TITLES.map((t) => t.title)).size).toBe(LABELLED_TITLES.length);
    for (const t of LABELLED_TITLES) expect(ids.has(t.topic), t.title).toBe(true);
    expect(LABELLED_TITLES.filter((t) => t.lang === 'sv').length).toBeGreaterThan(80);
    expect(LABELLED_TITLES.filter((t) => t.hard).length).toBeGreaterThan(40);
  });
});

describe('runPersona', () => {
  it('scores a simulation end to end, reproducibly', async () => {
    const sim = simulate(persona('sparse_2month'), 1);
    const a = await runPersona(sim, oracleClassifier(sim));
    const b = await runPersona(simulate(persona('sparse_2month'), 1), oracleClassifier(sim));
    expect(a.topicTruth).toEqual(a.topicPred);
    expect(a.originPred).toEqual(b.originPred);
    expect(a.drift.scripted).toBe(false);
    expect(a.watchTruth.length).toBe(a.watchPred.length);
  });
});
