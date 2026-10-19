// expo-file-system (SDK 58 object API: File / FileHandle) -> ByteSource. Native only.
import { File, FileMode } from 'expo-file-system';
import type { ByteSource } from './collect';

export function fileSource(uri: string): ByteSource {
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
