// OWNER: MVP2 ML agent. On-device topic model. Loaded lazily (dynamic import) only when the user turns on smart topics.
// Zero-shot multilingual (English + Swedish) topic classification with multilingual-e5-small,
// ensembled with the keyword classifier. Runs in a Web Worker or on the main thread; nothing leaves the device
// (only the model files are downloaded from the Hugging Face Hub, then cached by the browser).
import type { ImportProgress, TopicClassifier } from '@/lib/types';
import { createMlClassifierWith } from './core';
import { MODEL_PREFIX, loadEmbedder } from './model';

/** Creates the ML classifier, downloading/caching the model on first use. Rejects if the model can't load. */
export async function createMlClassifier(onProgress?: (p: ImportProgress) => void): Promise<TopicClassifier> {
  const progress = onProgress ?? (() => {});
  const { embed } = await loadEmbedder(progress);
  return createMlClassifierWith(embed, { prefix: MODEL_PREFIX, onProgress: progress, batchSize: 64 });
}

export { createMlClassifierWith, DEFAULT_TUNING, itemText } from './core';
export type { EmbedFn, MlOptions, MlTuning } from './core';
export { MODEL_ID } from './model';
