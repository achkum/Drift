// OWNER: parsers agent. Small helpers shared by the platform parsers.
import type { DriftEvent, EventKind, ExportFile, FollowRecord, ParseResult, Platform } from '@/lib/types';

/** Last path segment, lower-cased. */
export function baseName(path: string): string {
  const parts = path.split('/');
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

export function extName(path: string): string {
  const b = baseName(path);
  const i = b.lastIndexOf('.');
  return i >= 0 ? b.slice(i + 1) : '';
}

/** Deterministic event id, as described in types.ts. */
export function makeEventId(
  platform: Platform,
  kind: EventKind,
  time: string,
  key: string | undefined,
): string {
  return `${platform}:${kind}:${time}:${key ?? ''}`;
}

/** Fill in the id of an event from its fields. */
export function withId(e: Omit<DriftEvent, 'id'>): DriftEvent {
  const key = e.itemId ?? e.url ?? e.title ?? e.query;
  return { id: makeEventId(e.platform, e.kind, e.time, key), ...e };
}

/** Keep the first event per id. */
export function dedupeEvents(events: DriftEvent[]): DriftEvent[] {
  const seen = new Set<string>();
  const out: DriftEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export function dedupeFollows(follows: FollowRecord[]): FollowRecord[] {
  const seen = new Set<string>();
  return follows.filter((f) => {
    const k = `${f.platform}:${(f.url ?? f.name).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function uniqueStrings(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = s.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/** Parse any reasonable time value into an ISO UTC string. */
export function toIso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Unix seconds (Instagram) or milliseconds.
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (/^\d{9,13}$/.test(s)) return toIso(Number(s));
  // "YYYY-MM-DD HH:MM:SS" without zone: TikTok exports these in UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?$/.exec(s);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export function emptyResult(platform: ParseResult['platform']): ParseResult {
  return { platform, events: [], follows: [], interests: [], advertisers: [], warnings: [], filesUsed: [] };
}

/** Read a file as JSON. Returns undefined (and adds a warning) when it is not valid JSON. */
export async function readJson(file: ExportFile, warnings: string[]): Promise<unknown> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    warnings.push(`${file.path} could not be read, skipped.`);
    return undefined;
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    warnings.push(`${file.path} is not valid JSON, skipped.`);
    return undefined;
  }
}

export async function readText(file: ExportFile, warnings: string[]): Promise<string | undefined> {
  try {
    return (await file.text()).replace(/^﻿/, '');
  } catch {
    warnings.push(`${file.path} could not be read, skipped.`);
    return undefined;
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Case/space-insensitive property lookup: getKey(o, 'Video Link', 'link'). */
export function getKey(obj: unknown, ...names: string[]): unknown {
  if (!isRecord(obj)) return undefined;
  const wanted = names.map(normKey);
  for (const w of wanted) {
    for (const k of Object.keys(obj)) {
      if (normKey(k) === w) return obj[k];
    }
  }
  return undefined;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', emsp: ' ', ensp: ' ', thinsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(n) ? String.fromCodePoint(n) : all;
      } catch {
        return all;
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** Strip tags, decode entities, collapse whitespace. */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/[\s     ]+/g, ' ')
    .trim();
}

/**
 * Meta exports (Instagram, Facebook) write UTF-8 bytes as if each byte were a
 * latin1 code point ("cafÃ©" for "café"). Undo that when the string looks like it.
 */
export function fixMojibake(s: string): string {
  if (!/[\u0080-ÿ]/.test(s)) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) return s;
    bytes[i] = c;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}
