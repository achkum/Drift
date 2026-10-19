// Pure file -> ExportFile conversion. No Expo imports so it runs in node tests.
// Zips are streamed through fflate's Unzip in chunks; only data entries are inflated.
import { Unzip, UnzipInflate, type UnzipFile } from 'fflate';
import type { ExportFile, ImportProgress } from '@/lib/types';
import { isDataFile, isZipName, normalisePath } from '@/lib/pipeline/files';
import { utf8 } from './shims';

export { isDataFile, isZipName, normalisePath };

/** Sequential byte reader over a file (a chunked native read on device, an array in tests). */
export interface ByteSource {
  size: number;
  /** Next chunk of at most `max` bytes, or null at end of file. */
  read(max: number): Promise<Uint8Array | null>;
  /** Whole file as bytes (used for small loose files). */
  readAll(): Promise<Uint8Array>;
}

export interface SourceFile { name: string; source: ByteSource }

export interface CollectedFile extends ExportFile { source: string }

export const CHUNK_BYTES = 4 * 1024 * 1024;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export function bytesSource(bytes: Uint8Array): ByteSource {
  let off = 0;
  return {
    size: bytes.length,
    read: async (max) => {
      if (off >= bytes.length) return null;
      const out = bytes.subarray(off, off + max);
      off += out.length;
      return out;
    },
    readAll: async () => bytes,
  };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export async function unzipDataFiles(
  src: ByteSource,
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
      if (data && data.length) {
        // fflate may reuse its output buffer; copy so chunks stay valid.
        chunks.push(data.slice());
        len += data.length;
      }
      if (final) files.push({ path, bytes: concat(chunks.length ? chunks : [new Uint8Array(0)], len) });
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
    let read = 0;
    for (;;) {
      const chunk = await src.read(CHUNK_BYTES);
      if (!chunk) break;
      uz.push(chunk);
      if (entryError) throw entryError;
      read += chunk.length;
      onBytes?.(read);
      await yieldToUi();
    }
    uz.push(new Uint8Array(0), true);
  } catch (err) {
    throw damaged(err);
  }
  if (entryError) throw damaged(entryError);
  return { files, skipped };
}

const bytesFile = (path: string, bytes: Uint8Array, source: string): CollectedFile =>
  ({ path, source, text: async () => utf8(bytes) });

/** Builds ExportFile[] from any mix of zips and loose files. Duplicate paths keep the first copy. */
export async function collectExportFiles(
  inputs: SourceFile[],
  onProgress?: (p: ImportProgress) => void,
): Promise<{ files: CollectedFile[]; skipped: number }> {
  const out: CollectedFile[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const add = (f: CollectedFile) => { if (!seen.has(f.path)) { seen.add(f.path); out.push(f); } };

  const zips = inputs.filter((i) => isZipName(i.name));
  const loose = inputs.filter((i) => !isZipName(i.name));
  const msg = `Reading ${inputs.length} file${inputs.length === 1 ? '' : 's'}`;

  onProgress?.({ stage: 'reading', message: msg, fraction: 0 });
  for (const input of loose) {
    const path = normalisePath(input.name);
    if (!isDataFile(path)) { skipped++; continue; }
    add(bytesFile(path, await input.source.readAll(), input.name));
  }
  onProgress?.({ stage: 'reading', message: msg, fraction: 1 });

  const zipBytes = zips.reduce((s, z) => s + z.source.size, 0);
  let doneBytes = 0;
  for (const zip of zips) {
    let lastReport = -1;
    const label = zips.length > 1 ? `Unzipping ${zip.name}` : 'Unzipping your export';
    onProgress?.({ stage: 'unzipping', message: label, fraction: zipBytes ? doneBytes / zipBytes : 0 });
    const res = await unzipDataFiles(zip.source, zip.name, (read) => {
      const fraction = zipBytes ? Math.min(1, (doneBytes + read) / zipBytes) : 1;
      if (fraction - lastReport >= 0.01) { lastReport = fraction; onProgress?.({ stage: 'unzipping', message: label, fraction }); }
    });
    doneBytes += zip.source.size;
    skipped += res.skipped;
    for (const f of res.files) add(bytesFile(f.path, f.bytes, zip.name));
  }
  if (zips.length) onProgress?.({ stage: 'unzipping', message: 'Unzipped', fraction: 1 });
  return { files: out, skipped };
}
