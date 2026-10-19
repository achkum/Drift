// OWNER: household agent. Household state on this device, in its own IndexedDB
// database ('drift-household'), separate from the history database ('drift').
// Holds the non-extractable device keys, share settings, cached decrypted
// summaries from others, own safety alerts and the questions-about-me log.
import { openDB, deleteDB, type IDBPDatabase } from 'idb';

export const HOUSEHOLD_DB_NAME = 'drift-household';
const VERSION = 1;

export const STORES = [
  'kv',            // identity, profile, household
  'shareSettings', // memberId -> ShareSettings
  'summaries',     // memberId -> ReceivedSummary
  'profiles',      // memberId -> { displayName, role, sharedAt }
  'invites',       // tokenHash -> LocalInvite (owner only)
  'alerts',        // alertId -> SafetyAlert (own)
  'questions',     // noteId -> QuestionNote (about me)
  'published',     // `${kind}:${memberId}` -> { hash, at }
] as const;
export type StoreName = (typeof STORES)[number];

export interface LocalDb {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  all<T>(store: StoreName): Promise<{ key: string; value: T }[]>;
  clear(store: StoreName): Promise<void>;
  /** Closes and deletes the whole database, keys included. */
  destroy(): Promise<void>;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openLocalDb(name = HOUSEHOLD_DB_NAME): LocalDb {
  let p: Promise<IDBPDatabase> | null = null;
  const db = () => {
    if (!isIndexedDbAvailable()) return Promise.reject(new Error('Storage is not available in this browser.'));
    if (!p) {
      p = openDB(name, VERSION, {
        upgrade(d) { for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); },
        blocking() { void p?.then((x) => x.close()); p = null; },
        terminated() { p = null; },
      });
      p.catch(() => { p = null; });
    }
    return p;
  };
  return {
    async get<T>(s: StoreName, k: string) { return (await (await db()).get(s, k)) as T | undefined; },
    async put<T>(s: StoreName, k: string, v: T) { await (await db()).put(s, v, k); },
    async del(s: StoreName, k: string) { await (await db()).delete(s, k); },
    async all<T>(s: StoreName) {
      const d = await db();
      const tx = d.transaction(s);
      const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
      await tx.done;
      return keys.map((key, i) => ({ key: String(key), value: values[i] as T }));
    },
    async clear(s: StoreName) { await (await db()).clear(s); },
    async destroy() {
      if (p) { (await p).close(); p = null; }
      await deleteDB(name);
    },
  };
}
