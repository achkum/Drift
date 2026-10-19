// Pure merge helpers, same semantics as the web pipeline (src/lib/pipeline/core.ts).
import type {
  AdvertiserRecord, DriftEvent, FollowRecord, ParseResult, Platform, PlatformInterestList,
} from '@/lib/types';

export const NOT_AN_EXPORT_MESSAGE =
  "This doesn't look like a YouTube, TikTok or Instagram export. Upload the .zip file you downloaded " +
  '(or the unzipped folder) as it is, without renaming or moving files inside it. ' +
  'For YouTube, choose JSON as the format when you request the export.';

export const PLATFORM_LABELS: Record<Platform | 'mixed', string> = {
  youtube: 'YouTube',
  google_search: 'Google Search',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  mixed: 'several platforms',
};

export const followKey = (f: FollowRecord) => `${f.platform}:${f.name.toLowerCase()}`;
export const advertiserKey = (a: AdvertiserRecord) => `${a.platform}:${a.name.toLowerCase()}`;

export function mergeFollows(a: FollowRecord[], b: FollowRecord[]): FollowRecord[] {
  const m = new Map<string, FollowRecord>();
  for (const f of [...a, ...b]) m.set(followKey(f), f);
  return [...m.values()];
}

export function mergeAdvertisers(a: AdvertiserRecord[], b: AdvertiserRecord[]): AdvertiserRecord[] {
  const m = new Map<string, AdvertiserRecord>();
  for (const x of [...a, ...b]) m.set(advertiserKey(x), x);
  return [...m.values()];
}

export function mergeInterests(a: PlatformInterestList[], b: PlatformInterestList[]): PlatformInterestList[] {
  const m = new Map<Platform, string[]>();
  for (const list of [...a, ...b]) {
    const cur = m.get(list.platform) ?? [];
    const lower = new Set(cur.map((s) => s.toLowerCase()));
    for (const i of list.interests) if (!lower.has(i.toLowerCase())) { lower.add(i.toLowerCase()); cur.push(i); }
    m.set(list.platform, cur);
  }
  return [...m.entries()].map(([platform, interests]) => ({ platform, interests }));
}

export function hasAnyData(r: ParseResult): boolean {
  return r.events.length + r.follows.length + r.advertisers.length
    + r.interests.reduce((s, i) => s + i.interests.length, 0) > 0;
}

/** Splits parsed events into those not yet seen (by id) and a per-result count of new events. */
export function dedupeEvents(
  results: ParseResult[],
  existingIds: Set<string>,
): { fresh: DriftEvent[]; perResultNew: number[] } {
  const seen = new Set(existingIds);
  const fresh: DriftEvent[] = [];
  const perResultNew = results.map((r) => {
    let n = 0;
    for (const e of r.events) {
      if (!e || typeof e.id !== 'string' || seen.has(e.id)) continue;
      seen.add(e.id);
      fresh.push(e);
      n++;
    }
    return n;
  });
  return { fresh, perResultNew };
}
