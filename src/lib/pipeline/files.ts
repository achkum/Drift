// OWNER: pipeline agent. Turns uploads (zips, loose files, folder files) into ExportFile[].
// Works on the main thread and in a Web Worker. Media is skipped without being decompressed.
import { Unzip, UnzipInflate, type UnzipFile } from 'fflate';
import type { ExportFile, ImportProgress } from '@/lib/types';

/** One uploaded file. `path` is webkitRelativePath for folder uploads, else the file name. */
export interface UploadInput {
  file: Blob;
  name: string;
  path: string;
}

/** ExportFile plus which upload it came from (for ImportRecord.fileName). */
export interface CollectedFile extends ExportFile {
  source: string;
}

export const KEEP_EXTENSIONS = ['.json', '.html', '.htm', '.csv', '.txt'] as const;

export function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

function extension(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/** True for the data files Drift reads (.json .html .htm .csv .txt), false for media and junk. */
export function isDataFile(path: string): boolean {
  const p = normalisePath(path);
  if (!p || p.endsWith('/')) return false;
  const base = p.slice(p.lastIndexOf('/') + 1);
  if (p.startsWith('__MACOSX/') || p.includes('/__MACOSX/') || base.startsWith('._') || base === '.DS_Store') return false;
  return (KEEP_EXTENSIONS as readonly string[]).includes(extension(p));
}

export function isZipName(name: string): boolean {
  return extension(name) === '.zip';
}

/** Name shown in ImportRecord.fileName: the folder for folder uploads, else the file name. */
export function sourceName(input: UploadInput): string {
  const p = normalisePath(input.path);
  const slash = p.indexOf('/');
  return slash > 0 && !isZipName(input.name) ? p.slice(0, slash) : input.name;
}

const decoder = () => new TextDecoder('utf-8');

function bytesFile(path: string, bytes: Uint8Array, source: string): CollectedFile {
  return { path, source, text: async () => decoder().decode(bytes) };
}

function blobFile(path: string, blob: Blob, source: string): CollectedFile {
  return { path, source, text: async () => decoder().decode(new Uint8Array(await blob.arrayBuffer())) };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Streams a zip through fflate's Unzip. Only data files are decompressed; media entries are
 * never started, so their bytes pass through without being inflated or kept.
 */
export async function unzipDataFiles(
  blob: Blob,
  zipName: string,
  onBytes?: (bytesRead: number) => void,
): Promise<{ files: { path: string; bytes: Uint8Array }[]; skipped: number }> {
  const files: { path: string; bytes: Uint8Array }[] = [];
  let skipped = 0;
  let entryError: unknown = null;

  const uz = new Unzip((f: UnzipFile) => {
    const path = normalisePath(f.name);
    if (!isDataFile(path)) { if (!path.endsWith('/')) skipped++; return; }
    const chunks: Uint8Array[] = [];
    let len = 0;
    f.ondata = (err, data, final) => {
      if (err) { entryError = err; return; }
      if (data && data.length) { chunks.push(data); len += data.length; }
      if (final) files.push({ path, bytes: concat(chunks, len) });
    };
    try { f.start(); } catch (err) { entryError = err; }
  });
  uz.register(UnzipInflate);

  const damaged = (cause: unknown) => {
    const err = new Error(`Couldn't open "${zipName}". The zip may be damaged, still downloading, or password protected. Try downloading your export again.`);
    (err as Error & { cause?: unknown }).cause = cause;
    return err;
  };

  try {
    if (typeof blob.stream === 'function') {
      const reader = blob.stream().getReader();
      let read = 0;
      let lastYield = Date.now();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        uz.push(value);
        if (entryError) throw entryError;
        read += value.length;
        onBytes?.(read);
        // Keep the UI responsive on the main-thread fallback.
        if (Date.now() - lastYield > 50) { await yieldToEventLoop(); lastYield = Date.now(); }
      }
      uz.push(new Uint8Array(0), true);
    } else {
      const buf = new Uint8Array(await blob.arrayBuffer());
      uz.push(buf, true);
      onBytes?.(buf.length);
    }
  } catch (err) {
    throw damaged(err);
  }
  if (entryError) throw damaged(entryError);
  return { files, skipped };
}

export interface CollectResult {
  files: CollectedFile[];
  /** Media and other files ignored (count only). */
  skipped: number;
}

/**
 * Builds ExportFile[] from any mix of zips and loose files. Duplicate paths keep the first copy.
 * Reports 'reading' for loose files and 'unzipping' with a byte fraction for zips.
 */
export async function collectExportFiles(
  inputs: UploadInput[],
  onProgress?: (p: ImportProgress) => void,
): Promise<CollectResult> {
  const out: CollectedFile[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const add = (f: CollectedFile) => {
    if (seen.has(f.path)) return;
    seen.add(f.path);
    out.push(f);
  };

  const zips = inputs.filter((i) => isZipName(i.name));
  const loose = inputs.filter((i) => !isZipName(i.name));

  onProgress?.({ stage: 'reading', message: `Reading ${inputs.length} file${inputs.length === 1 ? '' : 's'}`, fraction: 0 });
  loose.forEach((input) => {
    const path = normalisePath(input.path || input.name);
    if (isDataFile(path)) add(blobFile(path, input.file, sourceName(input)));
    else skipped++;
  });
  onProgress?.({ stage: 'reading', message: `Reading ${inputs.length} file${inputs.length === 1 ? '' : 's'}`, fraction: 1 });

  const zipBytes = zips.reduce((s, z) => s + z.file.size, 0);
  let doneBytes = 0;
  for (const zip of zips) {
    let lastReport = -1;
    const label = zips.length > 1 ? `Unzipping ${zip.name}` : 'Unzipping your export';
    onProgress?.({ stage: 'unzipping', message: label, fraction: zipBytes ? doneBytes / zipBytes : 0 });
    const res = await unzipDataFiles(zip.file, zip.name, (read) => {
      const fraction = zipBytes ? Math.min(1, (doneBytes + read) / zipBytes) : 1;
      if (fraction - lastReport >= 0.01) {
        lastReport = fraction;
        onProgress?.({ stage: 'unzipping', message: label, fraction });
      }
    });
    doneBytes += zip.file.size;
    skipped += res.skipped;
    for (const f of res.files) add(bytesFile(f.path, f.bytes, zip.name));
  }
  if (zips.length) onProgress?.({ stage: 'unzipping', message: 'Unzipped', fraction: 1 });

  return { files: out, skipped };
}
