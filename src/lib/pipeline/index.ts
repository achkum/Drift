// OWNER: pipeline agent. Upload -> unzip -> parse -> analyse -> store. Runs fully in the browser.
import type { ImportProgress, ImportRecord, Insights } from '@/lib/types';

/** Import one or more uploaded files (.zip, .json, .html, .csv, or a folder's files). */
export async function importFiles(
  files: File[],
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportRecord[]> {
  void files; void onProgress;
  throw new Error('importFiles: not implemented');
}

/** Latest stored Insights, or null if nothing has been imported. */
export async function getInsights(): Promise<Insights | null> {
  return null;
}

export async function listImports(): Promise<ImportRecord[]> {
  return [];
}

/** Wipes every stored event, import and result on this device. */
export async function deleteAllData(): Promise<void> {}

/** JSON file of the computed Insights (no raw history). */
export async function exportResults(): Promise<Blob> {
  return new Blob(['{}'], { type: 'application/json' });
}
