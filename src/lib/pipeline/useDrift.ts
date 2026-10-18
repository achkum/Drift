'use client';
// OWNER: pipeline agent. The one hook the UI uses to read and change data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImportProgress, ImportRecord, Insights } from '@/lib/types';
import { sampleInsights } from '@/lib/sample/sampleInsights';
import { deleteAllData, getInsights, importFiles, listImports } from './index';

export interface DriftState {
  status: 'loading' | 'ready';
  /** Real insights, or sampleInsights when nothing is imported yet. */
  insights: Insights;
  /** True while showing sample data. */
  isSample: boolean;
  imports: ImportRecord[];
  /**
   * Current import progress. `stage: 'error'` carries a user-facing message when an import,
   * a delete or loading stored data failed. null when idle.
   */
  progress: ImportProgress | null;
  /**
   * Imports the files. Never rejects: on failure it resolves to [] and sets
   * `progress` to `{ stage: 'error', message }`.
   */
  importFiles(files: File[]): Promise<ImportRecord[]>;
  deleteAll(): Promise<void>;
  /** Re-reads stored Insights and imports (e.g. after another tab imported). */
  refresh(): Promise<void>;
}

const CHANNEL = 'drift-data';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function notifyOtherTabs() {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage('changed');
    ch.close();
  } catch { /* not supported */ }
}

export function useDrift(): DriftState {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [status, setStatus] = useState<DriftState['status']>('loading');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [i, im] = await Promise.all([getInsights(), listImports()]);
      if (!mounted.current) return;
      setInsights(i);
      setImports(im);
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
    let ch: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        ch = new BroadcastChannel(CHANNEL);
        ch.onmessage = () => { void refresh(); };
      }
    } catch { ch = null; }
    return () => {
      mounted.current = false;
      ch?.close();
    };
  }, [refresh]);

  const doImport = useCallback(async (files: File[]): Promise<ImportRecord[]> => {
    if (!files || files.length === 0) {
      setProgress({ stage: 'error', message: 'Choose a file or folder to import.' });
      return [];
    }
    setProgress({ stage: 'reading', message: 'Starting', fraction: 0 });
    try {
      const records = await importFiles(files, (p) => { if (mounted.current) setProgress(p); });
      await refresh();
      notifyOtherTabs();
      return records;
    } catch (err) {
      if (mounted.current) {
        setProgress({ stage: 'error', message: errorMessage(err, 'Something went wrong while importing.') });
      }
      return [];
    }
  }, [refresh]);

  const deleteAll = useCallback(async () => {
    try {
      await deleteAllData();
      if (mounted.current) setProgress(null);
    } catch (err) {
      if (mounted.current) setProgress({ stage: 'error', message: errorMessage(err, "Couldn't delete your data. Try again.") });
    }
    await refresh();
    notifyOtherTabs();
  }, [refresh]);

  return useMemo<DriftState>(() => ({
    status,
    insights: insights ?? sampleInsights,
    isSample: insights === null,
    imports,
    progress,
    importFiles: doImport,
    deleteAll,
    refresh,
  }), [status, insights, imports, progress, doImport, deleteAll, refresh]);
}
