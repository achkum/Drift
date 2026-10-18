// v1 keyword topic classifier. Implements TopicClassifier so a browser ML model can replace it.
import type { TopicClassifier, TopicId } from '@/lib/types';
import { nameKey, tokenize } from './text';
import { OTHER, TOPIC_KEYWORDS, UNKNOWN } from './topics';

type Hits = { topic: number; weight: number }[];

interface KeywordIndex {
  exact: Map<string, Hits>;
  phrases: Map<string, Hits>;
  maxPhrase: number;
  prefixes: Map<string, Hits>;
  prefixLengths: number[];
}

const TIERS = [['strong', 2], ['normal', 1], ['weak', 0.5]] as const;
const CHANNEL_WEIGHT = 0.8;
const MIN_SCORE = 1;

function addHit(map: Map<string, Hits>, key: string, topic: number, weight: number) {
  let hits = map.get(key);
  if (!hits) map.set(key, (hits = []));
  const same = hits.find((h) => h.topic === topic);
  if (same) same.weight = Math.max(same.weight, weight);
  else hits.push({ topic, weight });
}

function buildIndex(): KeywordIndex {
  const idx: KeywordIndex = { exact: new Map(), phrases: new Map(), maxPhrase: 1, prefixes: new Map(), prefixLengths: [] };
  const lengths = new Set<number>();
  TOPIC_KEYWORDS.forEach((t, ti) => {
    for (const [tier, weight] of TIERS) {
      const list = t[tier];
      if (!list) continue;
      for (const raw of list.split(',')) {
        const kw = raw.trim();
        if (!kw) continue;
        const prefix = kw.endsWith('*');
        const toks = tokenize(prefix ? kw.slice(0, -1) : kw);
        if (toks.length === 0) continue;
        if (toks.length > 1) {
          addHit(idx.phrases, toks.join(' '), ti, weight);
          idx.maxPhrase = Math.max(idx.maxPhrase, toks.length);
        } else if (prefix && toks[0].length >= 3) {
          addHit(idx.prefixes, toks[0], ti, weight);
          lengths.add(toks[0].length);
        } else {
          addHit(idx.exact, toks[0], ti, weight);
        }
      }
    }
  });
  idx.prefixLengths = [...lengths].sort((a, b) => a - b);
  return idx;
}

let INDEX: KeywordIndex | undefined;
const index = () => (INDEX ??= buildIndex());
const N = TOPIC_KEYWORDS.length;

/** Keyword score per topic for one text. Each keyword counts once. */
export function scoreText(text: string | undefined): Float64Array {
  const scores = new Float64Array(N);
  const toks = tokenize(text);
  if (toks.length === 0) return scores;
  const idx = index();
  const seen = new Set<string>();
  const add = (key: string, hits: Hits | undefined) => {
    if (!hits || seen.has(key)) return;
    seen.add(key);
    for (const h of hits) scores[h.topic] += h.weight;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    add(t, idx.exact.get(t));
    for (const L of idx.prefixLengths) {
      if (L > t.length) break;
      const p = t.slice(0, L);
      add(p + '*', idx.prefixes.get(p));
    }
    let phrase = t;
    for (let n = 2; n <= idx.maxPhrase && i + n - 1 < toks.length; n++) {
      phrase += ' ' + toks[i + n - 1];
      add(phrase, idx.phrases.get(phrase));
    }
  }
  return scores;
}

function best(scores: Float64Array): { top: number; topScore: number; second: number } {
  let top = -1, topScore = 0, second = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s > topScore) { second = topScore; topScore = s; top = i; } else if (s > second) second = s;
  }
  return { top, topScore, second };
}

function confidence(topScore: number, second: number): number {
  const c = (1 - Math.exp(-topScore / 2)) * (topScore / (topScore + second));
  return Math.round(c * 100) / 100;
}

/** Best topic for a short free text (e.g. a platform interest name), or undefined. */
export function matchTopic(text: string): TopicId | undefined {
  const { top, topScore } = best(scoreText(text));
  return top >= 0 && topScore >= MIN_SCORE ? TOPIC_KEYWORDS[top].id : undefined;
}

export interface KeywordClassifierOptions {
  /** Minimum classified items before a channel's main topic is inherited by its unmatched items. Default 3. */
  channelMinItems?: number;
  /** Share of a channel's classified items that must agree. Default 0.6. */
  channelMinShare?: number;
}

export function createKeywordClassifier(opts: KeywordClassifierOptions = {}): TopicClassifier {
  const minItems = opts.channelMinItems ?? 3;
  const minShare = opts.channelMinShare ?? 0.6;

  return {
    name: 'keyword',
    async classify(items) {
      const textCache = new Map<string, Float64Array>();
      const cached = (s: string | undefined) => {
        if (!s) return undefined;
        let v = textCache.get(s);
        if (!v) textCache.set(s, (v = scoreText(s)));
        return v;
      };

      const out: { topic: TopicId; confidence: number }[] = new Array(items.length);
      const channelKeys: (string | undefined)[] = new Array(items.length);
      const channelTally = new Map<string, Map<number, number>>();
      const channelTotal = new Map<string, number>();

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const title = cached(it.title);
        const query = cached(it.query);
        const channel = cached(it.channel);
        const ck = nameKey(it.channel);
        channelKeys[i] = ck;
        const scores = new Float64Array(N);
        for (let t = 0; t < N; t++) {
          scores[t] = (title?.[t] ?? 0) + (query?.[t] ?? 0) + (channel?.[t] ?? 0) * CHANNEL_WEIGHT;
        }
        if (it.url && /^(https?:\/\/)?music\.youtube\.com/i.test(it.url)) scores[MUSIC] += 2;

        const hasText = Boolean(it.title?.trim() || it.query?.trim() || it.channel?.trim());
        const { top, topScore, second } = best(scores);
        if (top >= 0 && topScore >= MIN_SCORE) {
          out[i] = { topic: TOPIC_KEYWORDS[top].id, confidence: confidence(topScore, second) };
          if (ck) {
            let tally = channelTally.get(ck);
            if (!tally) channelTally.set(ck, (tally = new Map()));
            tally.set(top, (tally.get(top) ?? 0) + 1);
            channelTotal.set(ck, (channelTotal.get(ck) ?? 0) + 1);
          }
        } else {
          out[i] = { topic: hasText ? OTHER : UNKNOWN, confidence: 0 };
        }
      }

      // Channel inheritance: unmatched items from a channel that is mostly one topic get that topic.
      const channelTopic = new Map<string, { topic: TopicId; share: number }>();
      for (const [ck, tally] of channelTally) {
        const total = channelTotal.get(ck) ?? 0;
        if (total < minItems) continue;
        let bestT = -1, bestN = 0;
        for (const [t, n] of tally) if (n > bestN) { bestN = n; bestT = t; }
        const share = bestN / total;
        if (bestT >= 0 && share >= minShare) channelTopic.set(ck, { topic: TOPIC_KEYWORDS[bestT].id, share });
      }
      if (channelTopic.size > 0) {
        for (let i = 0; i < items.length; i++) {
          const ck = channelKeys[i];
          if (!ck || out[i].topic !== OTHER) continue;
          const inherited = channelTopic.get(ck);
          if (inherited) out[i] = { topic: inherited.topic, confidence: Math.round(inherited.share * 35) / 100 };
        }
      }
      return out;
    },
  };
}

const MUSIC = TOPIC_KEYWORDS.findIndex((t) => t.id === 'music');
