// Optional processing steps chosen by DriftSettings. Heavy modules load only when switched on.
import type { DriftEvent, DriftSettings, ImportProgress, TopicClassifier } from '@/lib/types';
import { createKeywordClassifier } from '@/lib/analysis';
import { DEFAULT_SETTINGS } from '@/lib/settings';

type Progress = (p: ImportProgress) => void;

/** The ML classifier when smart topics is on and the model loads; keywords otherwise. */
export async function getClassifier(settings: DriftSettings = DEFAULT_SETTINGS, onProgress: Progress = () => {}): Promise<TopicClassifier> {
  if (settings.smartTopics) {
    try {
      const { createMlClassifier } = await import('@/lib/ml');
      return await createMlClassifier(onProgress);
    } catch {
      onProgress({ stage: 'loading-model', message: 'The topic model could not load, so Drift used keywords instead.' });
    }
  }
  return createKeywordClassifier();
}

/** Events with titles filled in by the opt-in lookup (to be saved), or [] when the lookup is off. */
export async function enrichEvents(events: DriftEvent[], settings: DriftSettings = DEFAULT_SETTINGS, onProgress: Progress = () => {}): Promise<DriftEvent[]> {
  if (!settings.titleLookup) return [];
  try {
    const { lookupMissingTitles } = await import('@/lib/enrich');
    return await lookupMissingTitles(events, onProgress);
  } catch {
    return [];
  }
}
