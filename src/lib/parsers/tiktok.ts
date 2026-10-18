// OWNER: parsers agent. TikTok "Download your data" export.
//
// JSON: user_data_tiktok.json (current) or user_data.json (older). Section names have changed between
// versions ("Activity" → "Your Activity", "Video Browsing History" → "Watch History", "Like List" →
// "Likes" ...), so instead of fixed paths we walk the whole tree and classify every list of records by
// the section names above it and the keys inside it:
//   records with SearchTerm                         → search
//   under *Browsing* / *Watch History*              → watch   (Date + Link, no titles)
//   under *Like*                                    → like
//   under *Favorite Video(s)*                       → save
//   under *Share*                                   → share
//   under *Following*                               → follows (UserName)
//   any value under a key like "Ad Interest(s)"     → interests ("A | B | C" string or list)
//   Off-TikTok activity "Source"                    → advertisers holding your data
// TXT exports ("Date: ...\nLink: ...") are parsed with the same rules using the file name as section.
// TikTok dates ("YYYY-MM-DD HH:MM:SS") are UTC.
import type { AdvertiserRecord, DriftEvent, EventKind, ExportFile, ExportParser, FollowRecord, ParseResult } from '@/lib/types';
import {
  baseName,
  dedupeEvents,
  dedupeFollows,
  emptyResult,
  extName,
  getKey,
  isRecord,
  readJson,
  readText,
  str,
  toIso,
  uniqueStrings,
  withId,
} from './util';

/** TXT export file names (folder layout varies). */
const TXT_NAME_RE = /(browsing|watch history|search|like list|likes|favorite video|share history|following)/i;

function isTikTokTxt(path: string): boolean {
  return extName(path) === 'txt' && TXT_NAME_RE.test(baseName(path)) && (/tiktok/i.test(path) || /video browsing|watch history/i.test(baseName(path)) || path.split('/').some((s) => /^(activity|your activity)$/i.test(s)));
}

function isTikTokJson(path: string): boolean {
  const b = baseName(path);
  if (b === 'user_data_tiktok.json') return true;
  // user_data.json is generic; accept it at the root of an upload or inside a TikTok-named folder.
  return b === 'user_data.json' && (path.split('/').length <= 2 || /tiktok/i.test(path));
}

type Section = 'watch' | 'search' | 'like' | 'save' | 'share' | 'following' | 'offsite' | undefined;

function sectionFromPath(keys: string[]): Section {
  const p = keys.join('/').toLowerCase();
  if (/(direct message|chat ?history|comment)/.test(p)) return undefined;
  if (/off[- ]?tiktok/.test(p)) return 'offsite';
  if (/search/.test(p)) return 'search';
  if (/like/.test(p)) return 'like'; // "Like List/ItemFavoriteList"
  if (/favou?rite ?videos?/.test(p)) return 'save'; // before watch: "FavoriteVideoList"
  if (/(browsing|watch ?history|videolist)/.test(p)) return 'watch';
  if (/share/.test(p)) return 'share';
  if (/following/.test(p)) return 'following';
  return undefined;
}

const SECTION_KIND: Partial<Record<Exclude<Section, undefined>, EventKind>> = {
  watch: 'watch',
  like: 'like',
  save: 'save',
  share: 'share',
};

export function tiktokItemId(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const m = /\/(?:video|v|photo)\/(\d{8,})/.exec(link) ?? /[?&](?:item_id|share_item_id)=(\d{8,})/.exec(link) ?? /(\d{15,21})/.exec(link);
  return m ? m[1] : undefined;
}

function linkOf(rec: Record<string, unknown>): string | undefined {
  for (const k of ['Link', 'VideoLink', 'Video Link', 'url', 'SharedContent', 'Shared Content']) {
    const v = str(getKey(rec, k));
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return undefined;
}

interface Acc {
  events: DriftEvent[];
  follows: FollowRecord[];
  interests: string[];
  advertisers: Map<string, number>;
  seen: Set<string>;
  noTime: number;
}

function handleRecord(rec: Record<string, unknown>, section: Section, acc: Acc): void {
  const time = toIso(getKey(rec, 'Date', 'Time', 'TimeStamp', 'Timestamp'));
  const searchTerm = str(getKey(rec, 'SearchTerm', 'Search Term'));
  if (searchTerm !== undefined || section === 'search') {
    if (!searchTerm) return;
    if (!time) {
      acc.noTime++;
      return;
    }
    acc.seen.add('search');
    acc.events.push(withId({ platform: 'tiktok', kind: 'search', time, query: searchTerm }));
    return;
  }
  if (section === 'following') {
    const name = str(getKey(rec, 'UserName', 'Username', 'User Name', 'Name'));
    if (!name) return;
    acc.seen.add('following');
    acc.follows.push({ platform: 'tiktok', name, url: `https://www.tiktok.com/@${encodeURIComponent(name)}`, since: time });
    return;
  }
  if (section === 'offsite') {
    const source = str(getKey(rec, 'Source'));
    if (source) acc.advertisers.set(source, (acc.advertisers.get(source) ?? 0) + 1);
    return;
  }
  const kind = section ? SECTION_KIND[section] : undefined;
  if (!kind) return;
  const url = linkOf(rec);
  if (!url) return;
  if (!time) {
    acc.noTime++;
    return;
  }
  acc.seen.add(kind);
  acc.events.push(withId({ platform: 'tiktok', kind, time, url, itemId: tiktokItemId(url) }));
}

function addInterests(value: unknown, acc: Acc): void {
  if (typeof value === 'string') {
    acc.interests.push(...value.split(/\s*[|,;\n]\s*/));
  } else if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === 'string') acc.interests.push(v);
      else if (isRecord(v)) {
        const name = str(getKey(v, 'Name', 'Category', 'Interest', 'Value'));
        if (name) acc.interests.push(name);
      }
    }
  } else if (isRecord(value)) {
    for (const v of Object.values(value)) addInterests(v, acc);
  }
}

function walk(node: unknown, keys: string[], acc: Acc, depth = 0): void {
  if (depth > 12) return;
  if (Array.isArray(node)) {
    const section = sectionFromPath(keys);
    for (const it of node) if (isRecord(it)) handleRecord(it, section, acc);
    return;
  }
  if (!isRecord(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (/ad ?interest/i.test(k.replace(/[_-]/g, ' '))) {
      acc.seen.add('interests');
      addInterests(v, acc);
      continue;
    }
    walk(v, keys.concat(k), acc, depth + 1);
  }
}

/** Parse "Key: value" blocks separated by blank lines (TikTok TXT export). */
export function parseTxtBlocks(text: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const rec: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^\s*([^:]{1,40}):\s*(.*)$/.exec(line);
      if (m) rec[m[1].trim()] = m[2].trim();
    }
    if (Object.keys(rec).length) out.push(rec);
  }
  return out;
}

export const tiktokParser: ExportParser = {
  id: 'tiktok',
  label: 'TikTok',

  detect(files) {
    return files.some((f) => isTikTokJson(f.path) || isTikTokTxt(f.path));
  },

  async parse(files: ExportFile[]): Promise<ParseResult> {
    const res = emptyResult('tiktok');
    const acc: Acc = { events: [], follows: [], interests: [], advertisers: new Map(), seen: new Set(), noTime: 0 };

    for (const file of files) {
      if (isTikTokJson(file.path)) {
        const data = await readJson(file, res.warnings);
        if (!isRecord(data)) {
          if (data !== undefined) res.warnings.push(`${file.path} has an unexpected structure, skipped.`);
          continue;
        }
        walk(data, [], acc);
        res.filesUsed.push(file.path);
      } else if (isTikTokTxt(file.path)) {
        const text = await readText(file, res.warnings);
        if (text === undefined) continue;
        const section = sectionFromPath([baseName(file.path)]);
        for (const rec of parseTxtBlocks(text)) handleRecord(rec, section, acc);
        res.filesUsed.push(file.path);
      }
    }

    res.events = dedupeEvents(acc.events);
    res.follows = dedupeFollows(acc.follows);
    const interests = uniqueStrings(acc.interests).filter((i) => !/^(none|n\/a|no data)$/i.test(i));
    if (interests.length) res.interests = [{ platform: 'tiktok', interests }];
    res.advertisers = [...acc.advertisers.keys()].map((name): AdvertiserRecord => ({ platform: 'tiktok', name }));

    if (!res.filesUsed.length) {
      res.warnings.push('No TikTok data file found. Upload user_data_tiktok.json (choose JSON when requesting your data).');
      return res;
    }
    if (!acc.seen.has('watch')) res.warnings.push('No TikTok watch history found. Request "All data" so "Watch History" is included.');
    if (!acc.seen.has('search')) res.warnings.push('No TikTok search history found, searches skipped.');
    if (!acc.seen.has('like')) res.warnings.push('No TikTok likes found.');
    if (!acc.seen.has('following')) res.warnings.push('No TikTok following list found, follows skipped.');
    if (!acc.seen.has('interests')) res.warnings.push('No TikTok ad interests found.');
    if (acc.noTime) res.warnings.push(`${acc.noTime} TikTok items without a readable date were skipped.`);
    return res;
  },
};
