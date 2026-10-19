import type { ImportProgress } from '@/lib/types';

/** Import and update stages in the order they run. */
export const STAGES: ImportProgress['stage'][] = ['reading', 'unzipping', 'parsing', 'enriching', 'loading-model', 'classifying', 'analysing', 'saving', 'done'];

/** Stages of "Update my results" (re-analysing stored data). */
export const RECOMPUTE_STAGES: ImportProgress['stage'][] = ['enriching', 'loading-model', 'classifying', 'analysing', 'saving', 'done'];

export const STAGE_LABEL: Record<ImportProgress['stage'], string> = {
  reading: 'Reading files',
  unzipping: 'Unzipping',
  parsing: 'Reading your history',
  enriching: 'Looking up missing titles',
  'loading-model': 'Downloading the topic model',
  classifying: 'Sorting into topics',
  analysing: 'Working out your drift',
  saving: 'Saving on this device',
  done: 'Done',
  error: 'Something went wrong',
};

/** 0-1. Uses the stage's own fraction when known, otherwise its position in the run. */
export function stageFraction(p: ImportProgress | null, stages: ImportProgress['stage'][] = STAGES): number {
  if (!p) return 0.05;
  if (typeof p.fraction === 'number' && Number.isFinite(p.fraction)) return Math.max(0, Math.min(1, p.fraction));
  const i = stages.indexOf(p.stage);
  return Math.max(0.05, i < 0 ? 0 : i / (stages.length - 1));
}
