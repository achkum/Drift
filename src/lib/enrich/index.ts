// OWNER: MVP2 enrich agent. Opt-in title lookup: fills missing titles by sending only video ids/links.
import type { DriftEvent, ImportProgress } from '@/lib/types';

/**
 * Returns the events whose title was filled in (with titleSource 'lookup'), for the caller to save.
 * Never throws: network failures are skipped.
 */
export async function lookupMissingTitles(events: DriftEvent[], onProgress?: (p: ImportProgress) => void): Promise<DriftEvent[]> {
  void events; void onProgress;
  return [];
}
