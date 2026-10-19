// Test helper only (never imported by the app): an expo-sqlite look-alike on node:sqlite, so the
// store's real SQL runs in vitest. Use: vi.mock('expo-sqlite', () => import('./fakeSqlite')).
import { DatabaseSync } from 'node:sqlite';

type Params = unknown[] | undefined;

class FakeDb {
  private db = new DatabaseSync(':memory:');
  async execAsync(sql: string) { this.db.exec(sql); }
  async getFirstAsync<T>(sql: string, params?: Params): Promise<T | null> {
    return (this.db.prepare(sql).get(...((params ?? []) as never[])) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, params?: Params): Promise<T[]> {
    return this.db.prepare(sql).all(...((params ?? []) as never[])) as T[];
  }
  async runAsync(sql: string, params?: Params) {
    const r = this.db.prepare(sql).run(...((params ?? []) as never[]));
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async withTransactionAsync(task: () => Promise<void>) {
    this.db.exec('BEGIN');
    try { await task(); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async closeAsync() { this.db.close(); }
}

let current: FakeDb | null = null;
/** A fresh in-memory database per call; the store caches it until closeDb(). */
export async function openDatabaseAsync(): Promise<FakeDb> {
  current = new FakeDb();
  return current;
}
export type SQLiteDatabase = FakeDb;
