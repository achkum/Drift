// SQLite storage for Drift (expo-sqlite async API). Same semantics as the web IndexedDB store
// (src/lib/store): events deduped by id, follows/advertisers keyed by platform+name, interests merged
// per platform, one Insights document. Everything stays on the device.
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type {
  AdvertiserRecord, DriftEvent, DriftSettings, FollowRecord, ImportRecord, Insights, PlatformInterestList,
} from '@/lib/types';
import { advertiserKey, followKey } from './merge';

export const DB_NAME = 'drift.db';
/** Bump when the schema changes and add a step to MIGRATIONS. */
export const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  // v1
  `CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL, time TEXT NOT NULL, json TEXT NOT NULL);
   CREATE INDEX events_time ON events (time);
   CREATE TABLE follows (key TEXT PRIMARY KEY NOT NULL, platform TEXT NOT NULL, json TEXT NOT NULL);
   CREATE TABLE interests (platform TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
   CREATE TABLE advertisers (key TEXT PRIMARY KEY NOT NULL, platform TEXT NOT NULL, json TEXT NOT NULL);
   CREATE TABLE imports (id TEXT PRIMARY KEY NOT NULL, imported_at TEXT NOT NULL, json TEXT NOT NULL);
   CREATE INDEX imports_at ON imports (imported_at);
   CREATE TABLE results (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
   CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);`,
];

const TABLES = ['events', 'follows', 'interests', 'advertisers', 'imports', 'results', 'settings'] as const;
/** Rows per multi-row INSERT (5 bind variables each, well under SQLite's limit). */
const ROWS_PER_STATEMENT = 100;
/** Rows per transaction, so the JS thread can breathe between batches. */
const ROWS_PER_TRANSACTION = 5000;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  if (v > SCHEMA_VERSION) throw new Error('This data was saved by a newer version of Drift. Update the app to open it.');
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    await db.withTransactionAsync(async () => { await db.execAsync(step); });
    v++;
    await db.execAsync(`PRAGMA user_version = ${v}`);
  }
}

export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      try { await db.execAsync('PRAGMA journal_mode = WAL'); } catch { /* not supported (web) */ }
      await migrate(db);
      return db;
    })().catch((err) => { dbPromise = null; throw err; });
  }
  return dbPromise;
}

/** Closes the cached connection (tests). */
export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) { try { await (await p).closeAsync(); } catch { /* already closed */ } }
}

type Row = (string | number)[];

/** Multi-row inserts in transactions of ROWS_PER_TRANSACTION. Returns rows actually written. */
async function bulkWrite(
  table: string,
  columns: string[],
  rows: Row[],
  verb: 'INSERT OR IGNORE' | 'INSERT OR REPLACE',
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  const one = `(${columns.map(() => '?').join(',')})`;
  let written = 0;
  for (let t = 0; t < rows.length; t += ROWS_PER_TRANSACTION) {
    const slice = rows.slice(t, t + ROWS_PER_TRANSACTION);
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < slice.length; i += ROWS_PER_STATEMENT) {
        const part = slice.slice(i, i + ROWS_PER_STATEMENT);
        const sql = `${verb} INTO ${table} (${columns.join(',')}) VALUES ${part.map(() => one).join(',')}`;
        const res = await db.runAsync(sql, part.flat());
        written += res.changes;
      }
    });
    if (t + ROWS_PER_TRANSACTION < rows.length) await yieldToUi();
  }
  return written;
}

const eventRow = (e: DriftEvent): Row => [e.id, e.platform, e.kind, e.time, JSON.stringify(e)];

/** Adds events, skipping ids already stored (and duplicates within `events`). Returns how many were new. */
export async function addEvents(events: DriftEvent[]): Promise<number> {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id)) continue;
    seen.add(e.id);
    rows.push(eventRow(e));
  }
  return bulkWrite('events', ['id', 'platform', 'kind', 'time', 'json'], rows, 'INSERT OR IGNORE');
}

/** Overwrites events by id (e.g. after a title lookup filled in titles). */
export async function putEvents(events: DriftEvent[]): Promise<void> {
  await bulkWrite('events', ['id', 'platform', 'kind', 'time', 'json'],
    events.filter((e) => e && typeof e.id === 'string').map(eventRow), 'INSERT OR REPLACE');
}

export async function addFollows(follows: FollowRecord[]): Promise<void> {
  await bulkWrite('follows', ['key', 'platform', 'json'],
    follows.map((f) => [followKey(f), f.platform, JSON.stringify(f)]), 'INSERT OR REPLACE');
}

/** Latest export wins for an advertiser (re-importing the same export must not double counts). */
export async function addAdvertisers(advertisers: AdvertiserRecord[]): Promise<void> {
  await bulkWrite('advertisers', ['key', 'platform', 'json'],
    advertisers.map((a) => [advertiserKey(a), a.platform, JSON.stringify(a)]), 'INSERT OR REPLACE');
}

/** Merges interest lists per platform (union, keeps first-seen order). */
export async function addInterests(lists: PlatformInterestList[]): Promise<void> {
  if (lists.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const list of lists) {
      const prev = await db.getFirstAsync<{ json: string }>('SELECT json FROM interests WHERE platform = ?', [list.platform]);
      const merged: string[] = prev ? (JSON.parse(prev.json) as PlatformInterestList).interests.slice() : [];
      const lower = new Set(merged.map((s) => s.toLowerCase()));
      for (const name of list.interests) {
        if (!lower.has(name.toLowerCase())) { lower.add(name.toLowerCase()); merged.push(name); }
      }
      await db.runAsync('INSERT OR REPLACE INTO interests (platform, json) VALUES (?, ?)',
        [list.platform, JSON.stringify({ platform: list.platform, interests: merged })]);
    }
  });
}

export async function addImports(records: ImportRecord[]): Promise<void> {
  await bulkWrite('imports', ['id', 'imported_at', 'json'],
    records.map((r) => [r.id, r.importedAt, JSON.stringify(r)]), 'INSERT OR REPLACE');
}

async function jsonRows<T>(sql: string): Promise<T[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(sql);
  return rows.map((r) => JSON.parse(r.json) as T);
}

/** Oldest first. */
export const getAllEvents = () => jsonRows<DriftEvent>('SELECT json FROM events ORDER BY time');
export const getAllFollows = () => jsonRows<FollowRecord>('SELECT json FROM follows');
export const getAllInterests = () => jsonRows<PlatformInterestList>('SELECT json FROM interests');
export const getAllAdvertisers = () => jsonRows<AdvertiserRecord>('SELECT json FROM advertisers');
/** Newest first. */
export const getAllImports = () => jsonRows<ImportRecord>('SELECT json FROM imports ORDER BY imported_at DESC');

export async function countEvents(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM events'))?.n ?? 0;
}

export async function saveInsights(insights: Insights): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO results (key, json) VALUES ('insights', ?)", [JSON.stringify(insights)]);
}

export async function loadInsights(): Promise<Insights | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>("SELECT json FROM results WHERE key = 'insights'");
  return row ? (JSON.parse(row.json) as Insights) : null;
}

export async function loadSettings(): Promise<Partial<DriftSettings>> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>("SELECT json FROM settings WHERE key = 'drift-settings'");
  return row ? (JSON.parse(row.json) as Partial<DriftSettings>) : {};
}

export async function saveSettings(settings: DriftSettings): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO settings (key, json) VALUES ('drift-settings', ?)", [JSON.stringify(settings)]);
}

export interface StoredData {
  events: DriftEvent[];
  follows: FollowRecord[];
  interests: PlatformInterestList[];
  advertisers: AdvertiserRecord[];
}

/** Everything analysis needs. */
export async function readAll(): Promise<StoredData> {
  const [events, follows, interests, advertisers] = await Promise.all([
    getAllEvents(), getAllFollows(), getAllInterests(), getAllAdvertisers(),
  ]);
  return { events, follows, interests, advertisers };
}

/** Wipes imported data and results. Settings are kept (they are preferences, not history). */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of TABLES) if (t !== 'settings') await db.runAsync(`DELETE FROM ${t}`);
  });
  try { await db.execAsync('VACUUM'); } catch { /* best effort */ }
}
