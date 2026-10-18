// OWNER: pipeline agent. IndexedDB storage for Drift. Everything stays on this device.
//
// SSR-safe: nothing touches `indexedDB` until a function is called. Works on the
// main thread and inside a Web Worker (both share the same database).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AdvertiserRecord, DriftEvent, FollowRecord, ImportRecord, Insights, PlatformInterestList,
} from '@/lib/types';

export const DB_NAME = 'drift';
/** Bump when the schema changes and add a step to `upgrade` below. */
export const DB_VERSION = 1;

interface DriftDB extends DBSchema {
  events: {
    key: string;
    value: DriftEvent;
    indexes: { platform: string; time: string };
  };
  /** Key: `${platform}:${name}` (out-of-line). */
  follows: { key: string; value: FollowRecord };
  /** Key: platform (out-of-line). One merged interest list per platform. */
  interests: { key: string; value: PlatformInterestList };
  /** Key: `${platform}:${name}` (out-of-line). */
  advertisers: { key: string; value: AdvertiserRecord };
  imports: { key: string; value: ImportRecord; indexes: { importedAt: string } };
  /** Key 'insights' -> latest Insights. Classified events are never stored, they are recomputed. */
  results: { key: string; value: Insights };
}

export type DriftDatabase = IDBPDatabase<DriftDB>;

const STORE_NAMES = ['events', 'follows', 'interests', 'advertisers', 'imports', 'results'] as const;

let dbPromise: Promise<DriftDatabase> | null = null;

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Opens (and creates / upgrades) the database. Cached per thread. */
export function getDb(): Promise<DriftDatabase> {
  if (!isStorageAvailable()) {
    return Promise.reject(new Error('Storage is not available in this browser, so Drift cannot keep your data on this device.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<DriftDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Fall through so a fresh install runs every step and older DBs run only what they miss.
        if (oldVersion < 1) {
          const events = db.createObjectStore('events', { keyPath: 'id' });
          events.createIndex('platform', 'platform');
          events.createIndex('time', 'time');
          db.createObjectStore('follows');
          db.createObjectStore('interests');
          db.createObjectStore('advertisers');
          const imports = db.createObjectStore('imports', { keyPath: 'id' });
          imports.createIndex('importedAt', 'importedAt');
          db.createObjectStore('results');
        }
        // if (oldVersion < 2) { ... next migration ... }
      },
      blocking() {
        // Another tab or the worker wants a newer version: let it.
        void closeDb();
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((err: unknown) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Closes the cached connection (tests, version changes). */
export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) {
    try { (await p).close(); } catch { /* already closed */ }
  }
}

const followKey = (f: FollowRecord) => `${f.platform}:${f.name.toLowerCase()}`;
const advertiserKey = (a: AdvertiserRecord) => `${a.platform}:${a.name.toLowerCase()}`;

/** Ids from `ids` that are already stored. */
export async function existingEventIds(ids: string[]): Promise<Set<string>> {
  const db = await getDb();
  const tx = db.transaction('events', 'readonly');
  const found = new Set<string>();
  await Promise.all(ids.map(async (id) => {
    if ((await tx.store.getKey(id)) !== undefined) found.add(id);
  }));
  await tx.done;
  return found;
}

/** Overwrites events by id (e.g. after a title lookup filled in titles). */
export async function putEvents(events: DriftEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('events', 'readwrite');
  await Promise.all(events.map((e) => tx.store.put(e)));
  await tx.done;
}

/** Adds events, skipping ids already stored (and duplicates within `events`). Returns how many were new. */
export async function addEvents(events: DriftEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const db = await getDb();
  const tx = db.transaction('events', 'readwrite');
  const seen = new Set<string>();
  let added = 0;
  const ops: Promise<unknown>[] = [];
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id)) continue;
    seen.add(e.id);
    ops.push(tx.store.getKey(e.id).then((k) => {
      if (k === undefined) { added++; return tx.store.put(e); }
      return undefined;
    }));
  }
  await Promise.all(ops);
  await tx.done;
  return added;
}

export async function addFollows(follows: FollowRecord[]): Promise<void> {
  if (follows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('follows', 'readwrite');
  await Promise.all(follows.map((f) => tx.store.put(f, followKey(f))));
  await tx.done;
}

/** Merges interest lists per platform (union, keeps first-seen order). */
export async function addInterests(lists: PlatformInterestList[]): Promise<void> {
  if (lists.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('interests', 'readwrite');
  for (const list of lists) {
    const prev = await tx.store.get(list.platform);
    const merged = [...(prev?.interests ?? [])];
    const lower = new Set(merged.map((s) => s.toLowerCase()));
    for (const name of list.interests) {
      if (!lower.has(name.toLowerCase())) { lower.add(name.toLowerCase()); merged.push(name); }
    }
    await tx.store.put({ platform: list.platform, interests: merged }, list.platform);
  }
  await tx.done;
}

/** Latest export wins for an advertiser (re-importing the same export must not double counts). */
export async function addAdvertisers(advertisers: AdvertiserRecord[]): Promise<void> {
  if (advertisers.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('advertisers', 'readwrite');
  await Promise.all(advertisers.map((a) => tx.store.put(a, advertiserKey(a))));
  await tx.done;
}

export async function addImports(records: ImportRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('imports', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function getAllEvents(): Promise<DriftEvent[]> {
  return (await getDb()).getAllFromIndex('events', 'time');
}

export async function countEvents(): Promise<number> {
  return (await getDb()).count('events');
}

export async function getAllFollows(): Promise<FollowRecord[]> {
  return (await getDb()).getAll('follows');
}

export async function getAllInterests(): Promise<PlatformInterestList[]> {
  return (await getDb()).getAll('interests');
}

export async function getAllAdvertisers(): Promise<AdvertiserRecord[]> {
  return (await getDb()).getAll('advertisers');
}

/** Newest first. */
export async function getAllImports(): Promise<ImportRecord[]> {
  const all = await (await getDb()).getAllFromIndex('imports', 'importedAt');
  return all.reverse();
}

export async function saveInsights(insights: Insights): Promise<void> {
  await (await getDb()).put('results', insights, 'insights');
}

export async function loadInsights(): Promise<Insights | null> {
  return (await (await getDb()).get('results', 'insights')) ?? null;
}

export interface StoredData {
  events: DriftEvent[];
  follows: FollowRecord[];
  interests: PlatformInterestList[];
  advertisers: AdvertiserRecord[];
}

/** Everything analysis needs, read in one transaction. */
export async function readAll(): Promise<StoredData> {
  const db = await getDb();
  const tx = db.transaction(['events', 'follows', 'interests', 'advertisers'], 'readonly');
  const [events, follows, interests, advertisers] = await Promise.all([
    tx.objectStore('events').index('time').getAll(),
    tx.objectStore('follows').getAll(),
    tx.objectStore('interests').getAll(),
    tx.objectStore('advertisers').getAll(),
  ]);
  await tx.done;
  return { events, follows, interests, advertisers };
}

/** Wipes every store. Keeps the (empty) database so open connections stay valid. */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...STORE_NAMES], 'readwrite');
  await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
