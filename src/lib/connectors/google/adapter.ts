// OWNER: sync agent. Turns Data Portability API archives into a Takeout-shaped zip that the
// YouTube parser (src/lib/parsers/youtube.ts) understands, without changing the parser.
//
// Google documents the record format (My Activity JSON, subscriptions CSV) but not the paths
// inside the archive zip, and the archive may be split over several zips. So this adapter
// finds files by content and loose path hints and re-files them under canonical paths:
//   Takeout/My Activity/YouTube/MyActivity.json          (myactivity.youtube)
//   Takeout/My Activity/Search/MyActivity.json           (myactivity.search)
//   Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv   (youtube.subscriptions)
// JSON is preferred over HTML for the same product. Media and unknown files are dropped.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
}

export const CANONICAL = {
  youtube: 'Takeout/My Activity/YouTube',
  search: 'Takeout/My Activity/Search',
  subscriptions: 'Takeout/YouTube and YouTube Music/subscriptions',
  history: 'Takeout/YouTube and YouTube Music/history',
} as const;

const DATA_EXT = /\.(json|html?|csv)$/i;

function ext(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : '';
}

function norm(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

type Product = 'youtube' | 'search';

function productFromPath(segs: string[]): Product | undefined {
  for (const s of segs) {
    if (/youtube/i.test(s)) return 'youtube';
    if (/^(search|google search|myactivity\.search)$/i.test(s)) return 'search';
  }
  return undefined;
}

function productFromRecord(rec: Record<string, unknown>): Product {
  const header = typeof rec.header === 'string' ? rec.header : '';
  const products = Array.isArray(rec.products) ? rec.products.map(String) : [];
  if (/youtube/i.test(header) || products.some((p) => /youtube/i.test(p))) return 'youtube';
  if (/^search$/i.test(header) || products.some((p) => /^search$/i.test(p))) return 'search';
  return 'youtube';
}

/** Re-files archive entries under the canonical Takeout paths. Pure; exported for tests. */
export function normalisePortabilityEntries(entries: ArchiveEntry[]): { entries: ArchiveEntry[]; warnings: string[] } {
  const json: Record<Product, ArchiveEntry[]> = { youtube: [], search: [] };
  const html: Record<Product, ArchiveEntry[]> = { youtube: [], search: [] };
  const subs: ArchiveEntry[] = [];
  const history: ArchiveEntry[] = [];
  const warnings: string[] = [];

  for (const e of entries) {
    const path = norm(e.path);
    if (!DATA_EXT.test(path)) continue;
    const segs = path.split('/');
    const name = segs[segs.length - 1];
    const folders = segs.slice(0, -1);
    const x = ext(path);
    const isActivity = folders.some((f) => /^my ?activity$/i.test(f) || /^myactivity\./i.test(f)) || /^my ?activity\.(json|html?)$/i.test(name);

    if (x === 'csv') {
      if (/subscri/i.test(name) || folders.some((f) => /subscri/i.test(f))) subs.push(e);
      continue;
    }
    if (!isActivity) {
      // Takeout-style YouTube history files, should the API ever return them.
      if (/^(watch|search)-history\.(json|html)$/i.test(name)) history.push({ path: `${CANONICAL.history}/${name}`, bytes: e.bytes });
      continue;
    }
    const fromPath = productFromPath(folders);
    if (x === 'json') {
      if (fromPath) {
        json[fromPath].push(e);
        continue;
      }
      // Unknown product folder: split the records by header / products.
      let data: unknown;
      try {
        data = JSON.parse(strFromU8(e.bytes));
      } catch {
        warnings.push(`${path} could not be read as JSON, skipped.`);
        continue;
      }
      if (!Array.isArray(data)) continue;
      const split: Record<Product, unknown[]> = { youtube: [], search: [] };
      for (const rec of data) if (rec && typeof rec === 'object') split[productFromRecord(rec as Record<string, unknown>)].push(rec);
      for (const p of ['youtube', 'search'] as const) if (split[p].length) json[p].push({ path, bytes: strToU8(JSON.stringify(split[p])) });
    } else {
      // HTML: the parser decides per item from its header, so the YouTube folder is a safe default.
      html[fromPath ?? 'youtube'].push(e);
    }
  }

  const out: ArchiveEntry[] = [];
  for (const p of ['youtube', 'search'] as const) {
    const files = json[p].length ? json[p] : html[p];
    files.forEach((f, i) => {
      const x = ext(f.path) === 'json' ? 'json' : 'html';
      out.push({ path: `${CANONICAL[p]}/MyActivity${i ? `-${i + 1}` : ''}.${x}`, bytes: f.bytes });
    });
  }
  subs.forEach((f, i) => out.push({ path: `${CANONICAL.subscriptions}/subscriptions${i ? `-${i + 1}` : ''}.csv`, bytes: f.bytes }));
  out.push(...history);
  if (!out.length) warnings.push('The Google archive contained no YouTube or Search activity.');
  return { entries: out, warnings };
}

/** Reads the data files from one archive zip (media is never inflated). */
export function readArchiveZip(zip: Uint8Array): ArchiveEntry[] {
  const files = unzipSync(zip, { filter: (f) => DATA_EXT.test(f.name) && !f.name.startsWith('__MACOSX/') });
  return Object.entries(files).map(([path, bytes]) => ({ path, bytes }));
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) && (bytes[3] === 4 || bytes[3] === 6);
}

/**
 * Downloaded archive parts → a single Takeout-shaped zip for importFiles(). Each part is a zip,
 * or (should Google ever serve one directly) a single data file named by `name`.
 */
export function buildImportZip(parts: { name: string; bytes: Uint8Array }[]): { zip: Uint8Array; warnings: string[]; files: string[] } {
  const all = parts.flatMap((p) => (isZip(p.bytes) ? readArchiveZip(p.bytes) : [{ path: p.name, bytes: p.bytes }]));
  const { entries, warnings } = normalisePortabilityEntries(all);
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.path] = e.bytes;
  // level 0: store only; the zip lives in memory for a moment before the pipeline reads it.
  return { zip: zipSync(files, { level: 0 }), warnings, files: Object.keys(files) };
}
