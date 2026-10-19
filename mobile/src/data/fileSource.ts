// expo-file-system (SDK 58 object API: File / FileHandle) -> ByteSource.
// On web the picker returns blob: URLs, which are read with fetch + Blob.slice (used for browser testing).
import { File, FileMode } from 'expo-file-system';
import type { ByteSource } from './collect';

function blobSource(uri: string): ByteSource {
  let blob: Blob | null = null;
  let pos = 0;
  const load = async () => (blob ??= await (await fetch(uri)).blob());
  return {
    get size() { return blob?.size ?? 0; },
    async read(max) {
      const b = await load();
      if (pos >= b.size) return null;
      const chunk = new Uint8Array(await b.slice(pos, Math.min(pos + max, b.size)).arrayBuffer());
      pos += chunk.length;
      return chunk;
    },
    async readAll() { return new Uint8Array(await (await load()).arrayBuffer()); },
  };
}

export function fileSource(uri: string): ByteSource {
  if (uri.startsWith('blob:')) return blobSource(uri);
  const file = new File(uri);
  let handle: ReturnType<File['open']> | null = null;
  let left = 0;
  const close = () => { try { handle?.close(); } catch { /* ignore */ } handle = null; };
  return {
    get size() { return file.size ?? 0; },
    async read(max) {
      if (!handle) { handle = file.open(FileMode.ReadOnly); left = handle.size ?? file.size ?? 0; }
      if (left <= 0) { close(); return null; }
      const chunk = await handle.readBytes(Math.min(max, left));
      left -= chunk.length;
      if (chunk.length === 0) { close(); return null; }
      return chunk;
    },
    async readAll() {
      return file.bytes();
    },
  };
}
