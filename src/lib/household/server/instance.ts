// OWNER: household agent. Process-wide mailbox handler for the Next.js route. Server-only.
//
// DRIFT_DATA_DIR       directory for household.sqlite (default `.data/`, keep it git-ignored)
// DRIFT_HOUSEHOLD_STORE  'memory' to keep everything in memory (dev / tests)
import { createHouseholdHandler, type HouseholdHandler } from './handler';
import { createMemoryStore, type HouseholdStore } from './store';

let handlerPromise: Promise<HouseholdHandler> | null = null;

async function openStore(): Promise<HouseholdStore> {
  if (process.env.DRIFT_HOUSEHOLD_STORE === 'memory') return createMemoryStore();
  const [{ join, resolve }, { createSqliteStore }] = await Promise.all([import('node:path'), import('./sqliteStore')]);
  const dir = resolve(process.env.DRIFT_DATA_DIR || '.data');
  return createSqliteStore(join(dir, 'household.sqlite'));
}

export function getHouseholdHandler(): Promise<HouseholdHandler> {
  if (!handlerPromise) {
    handlerPromise = openStore().then((store) => createHouseholdHandler({ store }));
    handlerPromise.catch(() => { handlerPromise = null; });
  }
  return handlerPromise;
}
