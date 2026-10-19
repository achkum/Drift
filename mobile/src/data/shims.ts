// Small React Native compatibility shims for the shared parsers. Import this module first.
// Hermes ships TextEncoder but TextDecoder support (and its `fatal` option) varies by version,
// and the Meta parser relies on `new TextDecoder('utf-8', { fatal: true })` to undo mojibake.

function decodeUtf8(bytes: Uint8Array, fatal: boolean): string {
  let out = '';
  let chunk: number[] = [];
  const flush = () => { out += String.fromCharCode(...chunk); chunk = []; };
  const bad = (): number => {
    if (fatal) throw new TypeError('The encoded data was not valid utf-8');
    return 0xfffd;
  };
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else {
      const need = b >= 0xf0 && b <= 0xf4 ? 3 : b >= 0xe0 && b < 0xf0 ? 2 : b >= 0xc2 && b < 0xe0 ? 1 : -1;
      if (need < 0) cp = bad();
      else {
        cp = b & (0x3f >> need);
        let ok = true;
        for (let k = 0; k < need; k++) {
          const c = bytes[i];
          if (c === undefined || (c & 0xc0) !== 0x80) { ok = false; break; }
          cp = (cp << 6) | (c & 0x3f);
          i++;
        }
        const min = need === 1 ? 0x80 : need === 2 ? 0x800 : 0x10000;
        if (!ok || cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) cp = bad();
      }
    }
    if (cp > 0xffff) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
    else chunk.push(cp);
    if (chunk.length > 8000) flush();
  }
  flush();
  return out;
}

class Utf8TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal: boolean;
  readonly ignoreBOM = false;
  constructor(label = 'utf-8', options?: { fatal?: boolean }) {
    if (!/^utf-?8$/i.test(label)) throw new RangeError(`Unsupported encoding: ${label}`);
    this.fatal = !!options?.fatal;
  }
  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return '';
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return decodeUtf8(bytes, this.fatal);
  }
}

/** True when the platform decoder supports `{ fatal: true }` and rejects invalid UTF-8. */
function nativeDecoderOk(): boolean {
  try {
    if (typeof TextDecoder === 'undefined') return false;
    const d = new TextDecoder('utf-8', { fatal: true });
    try { d.decode(new Uint8Array([0xff, 0xfe])); return false; } catch { /* expected */ }
    return d.decode(new Uint8Array([0xc3, 0xa9])) === 'é';
  } catch {
    return false;
  }
}

export function installShims(): void {
  if (!nativeDecoderOk()) {
    (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = Utf8TextDecoder;
  }
}

installShims();

/** UTF-8 decode without relying on the global (used by the file layer). */
export function utf8(bytes: Uint8Array): string {
  return decodeUtf8(bytes, false);
}
