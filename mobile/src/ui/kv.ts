// Tiny synchronous key-value store for device preferences (theme, onboarding done).
// Native: expo-sqlite/kv-store. Web preview: localStorage. Falls back to memory if neither works.
import { Platform } from 'react-native';

interface Store { get(k: string): string | null; set(k: string, v: string | null): void }

const memory = new Map<string, string>();
const memoryStore: Store = {
  get: (k) => memory.get(k) ?? null,
  set: (k, v) => { if (v === null) memory.delete(k); else memory.set(k, v); },
};

let store: Store | null = null;

function open(): Store {
  if (store) return store;
  try {
    if (Platform.OS === 'web') {
      const ls = globalThis.localStorage;
      store = {
        get: (k) => { try { return ls.getItem(k); } catch { return memory.get(k) ?? null; } },
        set: (k, v) => {
          try { if (v === null) ls.removeItem(k); else ls.setItem(k, v); } catch { memoryStore.set(k, v); }
        },
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Storage } = require('expo-sqlite/kv-store') as typeof import('expo-sqlite/kv-store');
      store = {
        get: (k) => Storage.getItemSync(k),
        set: (k, v) => { if (v === null) Storage.removeItemSync(k); else Storage.setItemSync(k, v); },
      };
    }
  } catch {
    store = memoryStore;
  }
  return store;
}

export function kvGet(key: string): string | null {
  try { return open().get(key); } catch { return memoryStore.get(key); }
}

export function kvSet(key: string, value: string | null): void {
  try { open().set(key, value); } catch { memoryStore.set(key, value); }
}
