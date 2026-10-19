// SEAM between the data layer and the screens. Same shape as the web app's useDrift
// (src/lib/pipeline/useDrift.ts), backed by SQLite (store.ts) and the import pipeline (import.ts).
import './shims';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriftSettings, ImportProgress, ImportRecord, Insights } from '@/lib/types';
import { sampleInsights } from '@/lib/sample/sampleInsights';
import { notifyDataChanged, subscribeDataChanged } from './events';
import { importPicked, recomputeInsights, type PickedFile } from './import';
import * as store from './store';

export type { PickedFile };
export { exportResultsJson } from './results';
export { shareFile } from './share';

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

const DEFAULT_SETTINGS: DriftSettings = { smartTopics: false, titleLookup: false };

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/** Serialises imports, recomputes and deletes so they never interleave. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export function useDrift(): DriftState {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [status, setStatus] = useState<DriftState['status']>('loading');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [settings, setSettingsState] = useState<DriftSettings>(DEFAULT_SETTINGS);
  const mounted = useRef(true);
  const settingsRef = useRef<DriftSettings>(DEFAULT_SETTINGS);

  const refresh = useCallback(async () => {
    try {
      const [i, im, s] = await Promise.all([store.loadInsights(), store.getAllImports(), store.loadSettings()]);
      if (!mounted.current) return;
      setInsights(i);
      setImports(im);
      settingsRef.current = { ...DEFAULT_SETTINGS, ...s };
      setSettingsState(settingsRef.current);
    } catch (err) {
      if (!mounted.current) return;
      setInsights(null);
      setImports([]);
      setProgress({ stage: 'error', message: errorMessage(err, "Couldn't read your saved data on this device.") });
    } finally {
      if (mounted.current) setStatus('ready');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const unsub = subscribeDataChanged(() => { void refresh(); });
    return () => { mounted.current = false; unsub(); };
  }, [refresh]);

  const updateSettings = useCallback((patch: Partial<DriftSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettingsState(next);
    void store.saveSettings(next).then(() => notifyDataChanged()).catch(() => { /* keep in memory only */ });
  }, []);

  const importFiles = useCallback((files: PickedFile[]): Promise<ImportRecord[]> => {
    if (!files || files.length === 0) {
      setProgress({ stage: 'error', message: 'Choose a file or folder to import.' });
      return Promise.resolve([]);
    }
    setProgress({ stage: 'reading', message: 'Starting', fraction: 0 });
    return enqueue(async () => {
      try {
        const records = await importPicked(files, (p) => { if (mounted.current) setProgress(p); });
        await refresh();
        notifyDataChanged();
        return records;
      } catch (err) {
        if (mounted.current) setProgress({ stage: 'error', message: errorMessage(err, 'Something went wrong while importing.') });
        return [];
      }
    });
  }, [refresh]);

  const recompute = useCallback((): Promise<void> => {
    setProgress({ stage: 'analysing', message: 'Starting', fraction: 0 });
    return enqueue(async () => {
      try {
        await recomputeInsights((p) => { if (mounted.current) setProgress(p); });
        await refresh();
        notifyDataChanged();
        if (mounted.current) setProgress({ stage: 'done', message: 'Updated your results.', fraction: 1 });
      } catch (err) {
        if (mounted.current) setProgress({ stage: 'error', message: errorMessage(err, 'Something went wrong while updating your results.') });
      }
    });
  }, [refresh]);

  const deleteAll = useCallback((): Promise<void> =>
    enqueue(async () => {
      try {
        await store.clearAll();
        if (mounted.current) setProgress(null);
      } catch (err) {
        if (mounted.current) setProgress({ stage: 'error', message: errorMessage(err, "Couldn't delete your data. Try again.") });
      }
      await refresh();
      notifyDataChanged();
    }), [refresh]);

  return useMemo<DriftState>(() => ({
    status,
    insights: insights ?? sampleInsights,
    isSample: insights === null,
    imports,
    progress,
    settings,
    updateSettings,
    importFiles,
    recompute,
    deleteAll,
  }), [status, insights, imports, progress, settings, updateSettings, importFiles, recompute, deleteAll]);
}
