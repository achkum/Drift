// Tiny module-level emitter: React Native has no BroadcastChannel, so every useDrift() instance
// subscribes here and reloads after an import, recompute, delete or settings change.
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeDataChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyDataChanged(): void {
  listeners.forEach((l) => { try { l(); } catch { /* a bad listener must not break the others */ } });
}
