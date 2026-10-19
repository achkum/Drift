// SEAM between the data layer (DATA agent) and the screens (SCREENS agent).
// Same shape as the web app's useDrift (src/lib/pipeline/useDrift.ts). Keep these signatures.
import { useState } from 'react';
import type { DriftSettings, ImportProgress, ImportRecord, Insights } from '@/lib/types';
import { sampleInsights } from '@/lib/sample/sampleInsights';

export interface PickedFile { uri: string; name: string; size?: number }

export interface DriftState {
  status: 'loading' | 'ready';
  /** Real insights, or sampleInsights when nothing is imported yet. */
  insights: Insights;
  isSample: boolean;
  imports: ImportRecord[];
  progress: ImportProgress | null;
  settings: DriftSettings;
  updateSettings(patch: Partial<DriftSettings>): void;
  /** Imports files chosen with expo-document-picker (zip, json, html, csv). Never rejects: errors arrive via progress. */
  importFiles(files: PickedFile[]): Promise<ImportRecord[]>;
  recompute(): Promise<void>;
  deleteAll(): Promise<void>;
}

/** STUB: the DATA agent replaces the body (SQLite store + import pipeline). */
export function useDrift(): DriftState {
  const [progress] = useState<ImportProgress | null>(null);
  return {
    status: 'ready', insights: sampleInsights, isSample: true, imports: [], progress,
    settings: { smartTopics: false, titleLookup: false },
    updateSettings: () => {},
    importFiles: async () => [], recompute: async () => {}, deleteAll: async () => {},
  };
}
