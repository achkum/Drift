// OWNER: analysis agent. Topic classification, served vs chosen labelling, drift metrics.
import type {
  AdvertiserRecord, ClassifiedEvent, DriftEvent, FollowRecord, Insights,
  PlatformInterestList, TopicClassifier, TopicDef,
} from '@/lib/types';
import { createKeywordClassifier as createKeyword } from './classifier';
import { buildInsights } from './insights';
import { labelOrigins } from './origin';
import { OTHER, TOPIC_DEFS, UNKNOWN } from './topics';

export interface AnalysisInput {
  events: DriftEvent[];
  follows: FollowRecord[];
  interests: PlatformInterestList[];
  advertisers: AdvertiserRecord[];
  /** Defaults to the latest event time. */
  now?: Date;
}

/** All topics, including 'other' (has text, no match) and 'unknown' (no text, e.g. TikTok watches). */
export const TOPICS: TopicDef[] = TOPIC_DEFS;

export function createKeywordClassifier(): TopicClassifier {
  return createKeyword();
}

/**
 * Classify topics, label origins, and build the Insights object the UI renders.
 * `classified` is sorted oldest first. Events with an unreadable time are skipped.
 */
export async function analyse(
  input: AnalysisInput,
  classifier: TopicClassifier = createKeywordClassifier(),
): Promise<{ classified: ClassifiedEvent[]; insights: Insights }> {
  const raw = input.events ?? [];
  const withTime: { ev: DriftEvent; t: number }[] = [];
  for (const ev of raw) {
    const t = Date.parse(ev.time);
    if (Number.isFinite(t)) withTime.push({ ev, t });
  }
  withTime.sort((a, b) => a.t - b.t);
  const events = withTime.map((x) => x.ev);
  const times = withTime.map((x) => x.t);

  const topics = events.length
    ? await classifier.classify(events.map((e) => ({ title: e.title, channel: e.channel?.name, query: e.query, url: e.url })))
    : [];
  const origins = labelOrigins(events, times, input.follows ?? []);

  const classified: ClassifiedEvent[] = events.map((e, i) => {
    // Any classifier: items with no text at all are 'unknown', never a guess.
    const hasText = Boolean(e.title?.trim() || e.query?.trim() || e.channel?.name?.trim());
    return {
      ...e,
      topic: hasText ? topics[i]?.topic ?? OTHER : UNKNOWN,
      topicConfidence: hasText ? topics[i]?.confidence ?? 0 : 0,
      origin: origins[i].origin,
      originReason: origins[i].originReason,
    };
  });
  const insights = buildInsights({
    events: classified,
    times,
    follows: input.follows ?? [],
    interests: input.interests ?? [],
    advertisers: input.advertisers ?? [],
    now: input.now,
  });
  return { classified, insights };
}

export { matchTopic, scoreText } from './classifier';
export { labelOrigins } from './origin';
export { interestTopic } from './insights';
