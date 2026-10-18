// OWNER: analysis agent. Topic classification, served vs chosen labelling, drift metrics.
import type {
  AdvertiserRecord, ClassifiedEvent, DriftEvent, FollowRecord, Insights,
  PlatformInterestList, TopicClassifier, TopicDef,
} from '@/lib/types';

export interface AnalysisInput {
  events: DriftEvent[];
  follows: FollowRecord[];
  interests: PlatformInterestList[];
  advertisers: AdvertiserRecord[];
  /** Defaults to the latest event time. */
  now?: Date;
}

export const TOPICS: TopicDef[] = [];

export function createKeywordClassifier(): TopicClassifier {
  return { name: 'keyword', classify: async (items) => items.map(() => ({ topic: 'other', confidence: 0 })) };
}

/** Classify topics, label origins, and build the Insights object the UI renders. */
export async function analyse(
  input: AnalysisInput,
  classifier: TopicClassifier = createKeywordClassifier(),
): Promise<{ classified: ClassifiedEvent[]; insights: Insights }> {
  void input; void classifier;
  throw new Error('analyse: not implemented');
}
