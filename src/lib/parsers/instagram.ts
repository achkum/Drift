// OWNER: parsers agent. Instagram "Download your information" (Accounts Center) JSON export.
//
// Files are matched by name anywhere in the archive, because the folder layout has moved between
// versions (e.g. ads_and_topics/ → ads_information/ads_and_topics/, likes/ → your_instagram_activity/likes/).
// Record shapes also vary, so every record is flattened from all known shapes:
//   older:  { title, string_map_data: { Author: { value }, Time: { timestamp } } }
//           { title, string_list_data: [ { href, value, timestamp } ] }
//   newer:  { timestamp, label_values: [ { label, value, href }, { label: "Owner", dict: [ { dict: [...] } ] } ] }
// Timestamps are unix seconds. Strings are UTF-8 bytes written as latin1 ("cafÃ©") and are repaired.
import type { AdvertiserRecord, DriftEvent, EventKind, ExportParser, FollowRecord, ParseResult } from '@/lib/types';
import {
  baseName,
  dedupeEvents,
  dedupeFollows,
  emptyResult,
  extName,
  fixMojibake,
  isRecord,
  readJson,
  str,
  toIso,
  uniqueStrings,
  withId,
} from './util';

type Role =
  | { role: 'event'; kind: EventKind }
  | { role: 'search' }
  | { role: 'following' }
  | { role: 'advertisers' }
  | { role: 'interests' };

const FILE_ROLES: [RegExp, Role][] = [
  [/^posts_viewed\.json$/, { role: 'event', kind: 'watch' }],
  [/^videos_watched\.json$/, { role: 'event', kind: 'watch' }],
  [/^ads_viewed\.json$/, { role: 'event', kind: 'ad' }],
  [/^ads_clicked\.json$/, { role: 'event', kind: 'ad' }],
  [/^liked_posts\.json$/, { role: 'event', kind: 'like' }],
  [/^saved_posts\.json$/, { role: 'event', kind: 'save' }],
  [/^(post_comments(_\d+)?|reels_comments|comments)\.json$/, { role: 'event', kind: 'comment' }],
  [/^(word_or_phrase_searches|keyword_searches|account_searches|profile_searches|tag_searches|hashtag_searches|recent_searches)\.json$/, { role: 'search' }],
  [/^following\.json$/, { role: 'following' }],
  [/^advertisers_using_your_activity_or_information\.json$/, { role: 'advertisers' }],
  [/^(recommended_topics|your_topics|ads_interests|your_interests)\.json$/, { role: 'interests' }],
];

const IG_FOLDER_RE = /^(your_instagram_activity|ads_information|ads_and_topics|instagram_ads_and_businesses|connections|followers_and_following|logged_information|preferences|your_topics|personal_information|security_and_login_information|likes|saved|comments|recent_searches)$/;

function isInstagramPath(path: string): boolean {
  const segs = path.split('/');
  if (segs.some((s) => /facebook/i.test(s))) return false;
  return segs.slice(0, -1).some((s) => IG_FOLDER_RE.test(s)) || /instagram/i.test(path);
}

function roleOf(path: string): Role | undefined {
  if (!isInstagramPath(path) && path.split('/').length > 1) return undefined;
  const b = baseName(path);
  for (const [re, role] of FILE_ROLES) if (re.test(b)) return role;
  return undefined;
}

// ── Record flattening ───────────────────────────────────────────────

interface Field {
  value?: string;
  href?: string;
  timestamp?: number;
}

interface Flat {
  title?: string;
  timestamp?: number;
  /** label (lower case) → field. Nested dict labels appear both as "owner.username" and "username". */
  fields: Map<string, Field>;
  /** Entries of string_list_data, in order. */
  list: Field[];
}

const fix = (v: unknown): string | undefined => {
  const s = str(v);
  return s === undefined ? undefined : fixMojibake(s);
};
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

function fieldOf(o: Record<string, unknown>): Field {
  return { value: fix(o.value), href: fix(o.href), timestamp: num(o.timestamp) ?? num(o.timestamp_value) };
}

function addLabelValues(flat: Flat, items: unknown, prefix: string, depth: number): void {
  if (!Array.isArray(items) || depth > 4) return;
  for (const lv of items) {
    if (!isRecord(lv)) continue;
    if (Array.isArray(lv.dict)) {
      const label = fix(lv.label)?.toLowerCase();
      addLabelValues(flat, lv.dict, label ? `${prefix}${label}.` : prefix, depth + 1);
      continue;
    }
    const label = fix(lv.label)?.toLowerCase();
    if (!label) continue;
    const f = fieldOf(lv);
    flat.fields.set(prefix + label, f);
    // Alias nested labels ("owner.username" → "username"), except links, which would be the owner's profile.
    if (prefix && label !== 'url' && label !== 'link' && !flat.fields.has(label)) flat.fields.set(label, f);
  }
}

export function flattenRecord(rec: Record<string, unknown>): Flat {
  const flat: Flat = {
    title: fix(rec.title),
    timestamp: num(rec.timestamp) ?? num(rec.creation_timestamp),
    fields: new Map(),
    list: [],
  };
  if (isRecord(rec.string_map_data)) {
    for (const [k, v] of Object.entries(rec.string_map_data)) {
      if (isRecord(v)) flat.fields.set(fixMojibake(k).toLowerCase(), fieldOf(v));
    }
  }
  if (Array.isArray(rec.string_list_data)) {
    for (const v of rec.string_list_data) if (isRecord(v)) flat.list.push(fieldOf(v));
  }
  addLabelValues(flat, rec.label_values, '', 0);
  // Some files are plain objects: { advertiser_name: "..." } or { value, href, timestamp }.
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'string' && !flat.fields.has(k.toLowerCase())) flat.fields.set(k.toLowerCase(), { value: fixMojibake(v) });
  }
  return flat;
}

function first(flat: Flat, ...labels: string[]): Field | undefined {
  for (const l of labels) {
    const f = flat.fields.get(l);
    if (f && (f.value || f.href || f.timestamp)) return f;
  }
  return undefined;
}

function timeOf(flat: Flat): string | undefined {
  let ts = flat.timestamp ?? first(flat, 'time', 'timestamp', 'saved on', 'date')?.timestamp ?? flat.list.find((f) => f.timestamp)?.timestamp;
  if (ts === undefined) for (const f of flat.fields.values()) if (f.timestamp) { ts = f.timestamp; break; }
  return ts === undefined ? undefined : toIso(ts);
}

function urlOf(flat: Flat): string | undefined {
  const isUrl = (s?: string) => !!s && /^https?:\/\//i.test(s);
  const u = first(flat, 'url', 'link', 'saved on', 'href');
  if (isUrl(u?.href)) return u!.href;
  if (isUrl(u?.value)) return u!.value;
  for (const f of flat.list) if (isUrl(f.href)) return f.href;
  for (const [k, f] of flat.fields) if (!k.includes('owner') && !k.includes('author') && isUrl(f.href)) return f.href;
  return undefined;
}

function authorOf(flat: Flat): string | undefined {
  const f = first(flat, 'author', 'owner.username', 'username', 'owner.name', 'media owner', 'owner', 'name');
  return f?.value ?? flat.title;
}

export function instagramItemId(url: string | undefined): string | undefined {
  const m = url ? /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url) : null;
  return m ? m[1] : undefined;
}

/** All records of a file: a top-level array, or every array of objects under the top-level keys. */
function recordsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  const out: Record<string, unknown>[] = [];
  for (const v of Object.values(data)) if (Array.isArray(v)) out.push(...v.filter(isRecord));
  return out;
}

// ── Parser ──────────────────────────────────────────────────────────

export const instagramParser: ExportParser = {
  id: 'instagram',
  label: 'Instagram',

  detect(files) {
    return files.some((f) => roleOf(f.path) !== undefined || (extName(f.path) === 'html' && isInstagramPath(f.path) && /instagram|your_instagram_activity/i.test(f.path)));
  },

  async parse(files): Promise<ParseResult> {
    const res = emptyResult('instagram');
    let events: DriftEvent[] = [];
    const follows: FollowRecord[] = [];
    const interests: string[] = [];
    const advertisers = new Map<string, AdvertiserRecord>();
    const adCounts = new Map<string, number>();
    const seen = new Set<string>();
    let noTime = 0;
    let htmlFiles = 0;

    for (const file of files) {
      const role = roleOf(file.path);
      if (!role) {
        if (extName(file.path) === 'html' && isInstagramPath(file.path)) htmlFiles++;
        continue;
      }
      const data = await readJson(file, res.warnings);
      if (data === undefined) continue;
      res.filesUsed.push(file.path);
      const records = recordsOf(data);

      for (const rec of records) {
        const flat = flattenRecord(rec);
        if (role.role === 'advertisers') {
          const name = flat.fields.get('advertiser_name')?.value ?? first(flat, 'name', 'advertiser')?.value ?? flat.title;
          if (name && !advertisers.has(name)) advertisers.set(name, { platform: 'instagram', name });
          seen.add('advertisers');
          continue;
        }
        if (role.role === 'interests') {
          const name = first(flat, 'name', 'interest', 'topic')?.value ?? flat.list[0]?.value ?? flat.title;
          if (name) interests.push(name);
          seen.add('interests');
          continue;
        }
        if (role.role === 'following') {
          const entry = flat.list[0];
          const name = entry?.value ?? flat.title ?? first(flat, 'username', 'name')?.value;
          if (!name) continue;
          const ts = entry?.timestamp ?? flat.timestamp;
          follows.push({ platform: 'instagram', name, url: entry?.href ?? `https://www.instagram.com/${name}`, since: ts ? toIso(ts) : undefined });
          seen.add('following');
          continue;
        }
        const time = timeOf(flat);
        if (!time) {
          noTime++;
          continue;
        }
        if (role.role === 'search') {
          const query = first(flat, 'search', 'query', 'value')?.value ?? flat.list[0]?.value ?? flat.title;
          if (!query) continue;
          events.push(withId({ platform: 'instagram', kind: 'search', time, query }));
          seen.add('search');
          continue;
        }
        const url = urlOf(flat);
        const author = authorOf(flat);
        const ev: Omit<DriftEvent, 'id'> = { platform: 'instagram', kind: role.kind, time };
        if (url) {
          ev.url = url;
          ev.itemId = instagramItemId(url);
        }
        if (author) ev.channel = { name: author, url: `https://www.instagram.com/${author}` };
        if (role.kind === 'ad') {
          ev.fromAds = true;
          if (author) adCounts.set(author, (adCounts.get(author) ?? 0) + 1);
        }
        events.push(withId(ev));
        seen.add(role.kind);
      }
    }

    // Advertisers: those with your data, plus accounts whose ads you saw (with counts).
    for (const [name, count] of adCounts) {
      const existing = advertisers.get(name);
      advertisers.set(name, { platform: 'instagram', name, count: (existing?.count ?? 0) + count });
    }

    events = dedupeEvents(events);
    res.events = events;
    res.follows = dedupeFollows(follows);
    const ints = uniqueStrings(interests);
    if (ints.length) res.interests = [{ platform: 'instagram', interests: ints }];
    res.advertisers = [...advertisers.values()];

    if (!res.filesUsed.length) {
      res.warnings.push(
        htmlFiles
          ? 'This Instagram export is in HTML format. Request it again with Format: JSON.'
          : 'No Instagram activity files found. Request "Your activity", "Ads information", "Connections" and "Preferences" in JSON format.',
      );
      return res;
    }
    if (!seen.has('watch')) res.warnings.push('posts_viewed.json / videos_watched.json not found, viewing history skipped.');
    if (!seen.has('ad')) res.warnings.push('ads_viewed.json not found, ads skipped.');
    if (!seen.has('like')) res.warnings.push('liked_posts.json not found, likes skipped.');
    if (!seen.has('following')) res.warnings.push('following.json not found, follows skipped.');
    if (!seen.has('interests')) res.warnings.push('No Instagram topics or ad interests found.');
    if (noTime) res.warnings.push(`${noTime} Instagram items without a date were skipped.`);
    return res;
  },
};
