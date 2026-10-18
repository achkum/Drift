'use client';
// OWNER: pipeline agent. The one hook the UI uses to read and change data.
import { useCallback, useEffect, useState } from 'react';
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
  progress: ImportProgress | null;
  importFiles(files: File[]): Promise<ImportRecord[]>;
  deleteAll(): Promise<void>;
}

export function useDrift(): DriftState {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [status, setStatus] = useState<DriftState['status']>('loading');
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const refresh = useCallback(async () => {
    const [i, im] = await Promise.all([getInsights(), listImports()]);
    setInsights(i); setImports(im); setStatus('ready');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    status,
    insights: insights ?? sampleInsights,
    isSample: insights === null,
    imports,
    progress,
    importFiles: async (files) => { const r = await importFiles(files, setProgress); await refresh(); return r; },
    deleteAll: async () => { await deleteAllData(); await refresh(); },
  };
}
