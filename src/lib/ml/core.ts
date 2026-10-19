// Zero-shot topic classification by prototype similarity, ensembled with the keyword classifier.
// Model-free: the embedding function is injected, so this is unit-testable in node.
import type { ImportProgress, TopicClassifier, TopicDef, TopicId } from '@/lib/types';
import { TOPICS, createKeywordClassifier } from '@/lib/analysis';
import { prototypesFor } from './prototypes';

/** Embeds texts into L2-normalised vectors, same order. */
export type EmbedFn = (texts: string[]) => Promise<ArrayLike<number>[]>;

type Item = Parameters<TopicClassifier['classify']>[0][number];
type Result = { topic: TopicId; confidence: number };

export interface MlTuning {
  /** Keyword confidence at or above which the keyword result is kept without asking the model. */
  keywordStrong: number;
  /** Softmax temperature over prototype similarities (e5 similarities are compressed near 0.7-0.9). */
  temperature: number;
  /** Weight of the centroid similarity vs the best single prototype. */
  centroidWeight: number;
  /** Minimum model probability for the top topic. */
  minProb: number;
  /** Minimum raw similarity for the top topic; below this the text is 'other'. */
  minSim: number;
  /** How much a weak keyword vote adds to the model probability of that topic. */
  keywordWeight: number;
}

export const DEFAULT_TUNING: MlTuning = {
  keywordStrong: 0.8,
  temperature: 0.0075,
  centroidWeight: 1,
  minProb: 0.3,
  minSim: 0.8,
  keywordWeight: 0.25,
};

export interface MlOptions {
  name?: string;
  /** Text prefix the model expects (e5: "query: "). Applied to prototypes and items alike. */
  prefix?: string;
  batchSize?: number;
  onProgress?: (p: ImportProgress) => void;
  /** Defaults to TOPICS without 'other' and 'unknown'. */
  topics?: TopicDef[];
  /** Defaults to the keyword classifier. */
  keyword?: TopicClassifier;
  tuning?: Partial<MlTuning>;
}

const SKIP = new Set(['other', 'unknown']);
const MAX_CHARS = 240;

/** The text the model sees for one item: the query, or title plus channel. '' when there is none. */
export function itemText(it: Item): string {
  const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const query = clean(it.query);
  const title = clean(it.title);
  const channel = clean(it.channel);
  const text = query || (title && channel ? `${title} (${channel})` : title || channel);
  return text.slice(0, MAX_CHARS);
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalised(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

interface TopicVecs {
  centroid: Float32Array;
  protos: ArrayLike<number>[];
}

/** Similarity of one embedded text to every topic. */
export function topicSimilarities(vec: ArrayLike<number>, topics: TopicVecs[], centroidWeight: number): Float64Array {
  const out = new Float64Array(topics.length);
  topics.forEach((t, i) => {
    let maxP = -1;
    for (const p of t.protos) maxP = Math.max(maxP, dot(vec, p));
    out[i] = centroidWeight * dot(vec, t.centroid) + (1 - centroidWeight) * maxP;
  });
  return out;
}

export function softmax(xs: Float64Array, temperature: number): Float64Array {
  let max = -Infinity;
  for (const x of xs) max = Math.max(max, x);
  const out = new Float64Array(xs.length);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) sum += out[i] = Math.exp((xs[i] - max) / temperature);
  for (let i = 0; i < xs.length; i++) out[i] /= sum;
  return out;
}

const round2 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;

/**
 * Combine the model's view with the keyword result for one item.
 * `sims` are raw similarities per topic (same order as `ids`).
 */
export function decide(kw: Result, sims: Float64Array, ids: TopicId[], tuning: MlTuning): Result {
  const probs = softmax(sims, tuning.temperature);
  const kwIdx = kw.topic && !SKIP.has(kw.topic) ? ids.indexOf(kw.topic) : -1;
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < ids.length; i++) {
    const s = probs[i] + (i === kwIdx ? tuning.keywordWeight * kw.confidence : 0);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (best >= 0 && best === kwIdx) {
    // Model and (weak) keywords agree. When the model is itself sure, more sure than either alone.
    const modelSure = probs[best] >= tuning.minProb && sims[best] >= tuning.minSim;
    const conf = modelSure ? 1 - (1 - kw.confidence) * (1 - probs[best]) : Math.max(kw.confidence, probs[best]);
    return { topic: kw.topic, confidence: round2(conf) };
  }
  if (best >= 0 && probs[best] >= tuning.minProb && sims[best] >= tuning.minSim) {
    // Model probability, scaled down a little: zero-shot is less certain than a strong keyword hit.
    return { topic: ids[best], confidence: round2(probs[best] * 0.9) };
  }
  if (kwIdx >= 0) return kw;
  return { topic: 'other', confidence: 0 };
}

/**
 * Builds a TopicClassifier from any embedding function. Embeds the topic prototypes once,
 * then classifies items whose keyword result is not already strong.
 */
export async function createMlClassifierWith(embed: EmbedFn, opts: MlOptions = {}): Promise<TopicClassifier> {
  const tuning: MlTuning = { ...DEFAULT_TUNING, ...opts.tuning };
  const prefix = opts.prefix ?? '';
  const batchSize = Math.max(1, opts.batchSize ?? 64);
  const onProgress = opts.onProgress ?? (() => {});
  const keyword = opts.keyword ?? createKeywordClassifier();
  const topicDefs = (opts.topics ?? TOPICS).filter((t) => !SKIP.has(t.id));
  const ids = topicDefs.map((t) => t.id);

  // Prototype embeddings, one batch per topic.
  const topics: TopicVecs[] = [];
  for (const t of topicDefs) {
    const protos = await embed(prototypesFor(t).map((s) => prefix + s));
    if (protos.length === 0) throw new Error(`No prototype embeddings for ${t.id}`);
    const centroid = new Float32Array(protos[0].length);
    for (const p of protos) for (let i = 0; i < centroid.length; i++) centroid[i] += p[i];
    topics.push({ centroid: normalised(centroid), protos });
  }

  return {
    name: 'ml-e5',
    async classify(items) {
      const kw = await keyword.classify(items);
      const texts = items.map(itemText);

      // Unique texts the model needs to see (keyword result not strong), shortest first to limit padding.
      const unique = new Map<string, Float64Array | undefined>();
      texts.forEach((t, i) => {
        if (t && kw[i].confidence < tuning.keywordStrong) unique.set(t, undefined);
      });
      const todo = [...unique.keys()].sort((a, b) => a.length - b.length);
      const total = todo.length;
      if (total > 0) onProgress({ stage: 'classifying', message: `Reading ${total.toLocaleString('en')} titles with the topic model`, fraction: 0 });
      for (let start = 0; start < total; start += batchSize) {
        const batch = todo.slice(start, start + batchSize);
        const vecs = await embed(batch.map((t) => prefix + t));
        batch.forEach((t, j) => unique.set(t, topicSimilarities(vecs[j], topics, tuning.centroidWeight)));
        const done = Math.min(total, start + batch.length);
        onProgress({ stage: 'classifying', message: `Reading titles with the topic model (${done.toLocaleString('en')} of ${total.toLocaleString('en')})`, fraction: done / total });
      }

      return items.map((_, i): Result => {
        const text = texts[i];
        if (!text) return { topic: 'other', confidence: 0 };
        const sims = unique.get(text);
        if (!sims) return kw[i]; // strong keyword hit
        return decide(kw[i], sims, ids, tuning);
      });
    },
  };
}
