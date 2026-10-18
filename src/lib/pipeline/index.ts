// OWNER: pipeline agent. Upload -> unzip -> parse -> analyse -> store. Runs fully in the browser.
//
// The heavy part runs in a Web Worker when the browser supports it, with a main-thread fallback
// (the fallback yields to the UI between stages). SSR-safe: no window / indexedDB access at import time.
import type { ImportProgress, ImportRecord, Insights } from '@/lib/types';
import * as store from '@/lib/store';
import { runImport, DriftImportError } from './core';
import type { UploadInput } from './files';
import type { WorkerRequest, WorkerResponse } from './protocol';

export { DriftImportError, NOT_AN_EXPORT_MESSAGE, recomputeInsights } from './core';

const EXPORT_FORMAT_VERSION = 1;

function toInputs(files: File[]): UploadInput[] {
  return files.map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return { file, name: file.name, path: rel && rel.length > 0 ? rel : file.name };
  });
}

function canUseWorker(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof indexedDB !== 'undefined';
}

/** Distinguishes "the worker could not start" (fall back) from a real import failure. */
class WorkerUnavailable extends Error {}

function importInWorker(inputs: UploadInput[], onProgress?: (p: ImportProgress) => void): Promise<ImportRecord[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(new WorkerUnavailable(String(err)));
      return;
    }
    let started = false;
    const finish = () => worker.terminate();
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      started = true;
      if (msg.type === 'progress') onProgress?.(msg.progress);
      else if (msg.type === 'done') { finish(); resolve(msg.records); }
      else if (msg.type === 'error') { finish(); reject(new DriftImportError(msg.message)); }
    };
    worker.onerror = (ev) => {
      ev.preventDefault?.();
      finish();
      if (!started) reject(new WorkerUnavailable(ev.message || 'worker failed to start'));
      else reject(new Error('The import stopped unexpectedly. The export may be too large for this browser. Try a desktop browser, or upload only the history files.'));
    };
    worker.onmessageerror = () => {
      finish();
      if (!started) reject(new WorkerUnavailable('worker message error'));
      else reject(new Error('The import stopped unexpectedly.'));
    };
    try {
      const req: WorkerRequest = { type: 'import', inputs };
      worker.postMessage(req);
    } catch (err) {
      finish();
      reject(new WorkerUnavailable(String(err)));
    }
  });
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Import one or more uploaded files (.zip, .json, .html, .csv, or a folder's files).
 * Rejects with a user-facing Error message when the upload can't be used; progress also gets
 * a final `{ stage: 'error', message }` in that case.
 */
export async function importFiles(
  files: File[],
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportRecord[]> {
  const run = async (): Promise<ImportRecord[]> => {
    const inputs = toInputs(files);
    try {
      if (canUseWorker()) {
        try {
          return await importInWorker(inputs, onProgress);
        } catch (err) {
          if (!(err instanceof WorkerUnavailable)) throw err;
          // Fall through to the main thread.
        }
      }
      return await runImport(inputs, onProgress);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Something went wrong while importing.';
      onProgress?.({ stage: 'error', message });
      throw err instanceof Error ? err : new Error(message);
    }
  };
  // One import at a time, so dedupe and recompute never interleave.
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Latest stored Insights, or null if nothing has been imported. */
export async function getInsights(): Promise<Insights | null> {
  if (!store.isStorageAvailable()) return null;
  return store.loadInsights();
}

/** Newest first. */
export async function listImports(): Promise<ImportRecord[]> {
  if (!store.isStorageAvailable()) return [];
  return store.getAllImports();
}

/** Wipes every stored event, import and result on this device. */
export async function deleteAllData(): Promise<void> {
  if (!store.isStorageAvailable()) return;
  await queue; // don't race an import in progress
  await store.clearAll();
}

/** JSON file of the computed Insights and import metadata (never raw events). */
export async function exportResults(): Promise<Blob> {
  const [insights, imports] = await Promise.all([getInsights(), listImports()]);
  const payload = {
    app: 'drift',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    note: 'Computed results only. Your raw watch, search and ad history is not included.',
    insights,
    imports: imports.map((r) => ({
      id: r.id, platform: r.platform, importedAt: r.importedAt, fileName: r.fileName,
      events: r.events, newEvents: r.newEvents, warnings: r.warnings,
    })),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}
