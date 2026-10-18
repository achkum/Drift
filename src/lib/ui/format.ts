import type { Platform } from '@/lib/types';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseMonth(ym: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(ym);
  if (!match) return null;
  const m = Number(match[2]) - 1;
  if (m < 0 || m > 11) return null;
  return { y: Number(match[1]), m };
}

/** '2026-07' → 'Jul', or "Jul '26" with withYear. */
export function monthShort(ym: string, withYear = false): string {
  const p = parseMonth(ym);
  if (!p) return ym;
  return withYear ? `${SHORT[p.m]} ’${String(p.y).slice(2)}` : SHORT[p.m];
}

/** '2026-07' → 'July', or 'July 2026' with withYear. */
export function monthLong(ym: string, withYear = false): string {
  const p = parseMonth(ym);
  if (!p) return ym;
  return withYear ? `${LONG[p.m]} ${p.y}` : LONG[p.m];
}

/** ISO date → '12 Oct 2026'. Uses UTC so server and client agree. */
export function dateShort(iso: string, withYear = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = `${d.getUTCDate()} ${SHORT[d.getUTCMonth()]}`;
  return withYear ? `${s} ${d.getUTCFullYear()}` : s;
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  google_search: 'Google Search',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export function platformLabel(p: Platform | 'mixed'): string {
  return p === 'mixed' ? 'Several platforms' : PLATFORM_LABEL[p];
}

export function platformInitial(p: Platform): string {
  return p === 'google_search' ? 'G' : PLATFORM_LABEL[p][0];
}

const NUM = new Intl.NumberFormat('en-GB');
export function num(n: number): string {
  return NUM.format(Math.round(n));
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** +15% / −11% with a real minus sign. */
export function signedPct(delta: number): string {
  const r = Math.round(delta);
  return `${r >= 0 ? '+' : '−'}${Math.abs(r)} pts`;
}

/** "A", "A and B", "A, B and C". */
export function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
