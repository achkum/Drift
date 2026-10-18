// OWNER: MVP2 ML agent. On-device topic model. Loaded lazily (dynamic import) only when the user turns on smart topics.
import type { ImportProgress, TopicClassifier } from '@/lib/types';

/** Creates the ML classifier, downloading/caching the model on first use. Rejects if the model can't load. */
export async function createMlClassifier(onProgress?: (p: ImportProgress) => void): Promise<TopicClassifier> {
  void onProgress;
  throw new Error('ML classifier not implemented');
}
