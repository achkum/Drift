// OWNER: parsers agent. YouTube (+ Google Search) from a Google Takeout export.
//
// Supported files (any Takeout locale; folder and file names are matched loosely):
//   Takeout/YouTube and YouTube Music/history/watch-history.json|html
//   Takeout/YouTube and YouTube Music/history/search-history.json|html
//   Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv
//   Takeout/My Activity/YouTube/MyActivity.json|html     (same data as history/)
//   Takeout/My Activity/Search/MyActivity.json|html      (Google Search → platform 'google_search')
// Items are classified by their URL first (watch / shorts / results?search_query= / google search?q=),
// which works in every language, then by the localised title prefix ("Watched", "Tittade på" ...).
import type { DriftEvent, ExportFile, ExportParser, FollowRecord, ParseResult } from '@/lib/types';
import { parseTakeoutDate } from './takeoutDate';
import {
  baseName,
  dedupeEvents,
  dedupeFollows,
  decodeEntities,
  emptyResult,
  extName,
  htmlToText,
  isRecord,
  parseCsv,
  readJson,
  readText,
  str,
  toIso,
  withId,
} from './util';

// ── Localised strings ───────────────────────────────────────────────

/** Title prefixes for watched items. English and Swedish verified; others best effort. */
const WATCH_PREFIXES = [
  'Watched ', 'Tittade på ', 'Har set ', 'Så på ', 'Has visto ', 'Vous avez regardé ', 'Hai guardato ',
  'Bekeken: ', 'Assistiu a ',
];
/** Title prefixes for searches. */
const SEARCH_PREFIXES = [
  'Searched for ', 'Sökte efter ', 'Sökte på ', 'Søgte efter ', 'Søkte etter ', 'Has buscado ',
  'Vous avez recherché ', 'Hai cercato ', 'Gezocht naar ', 'Pesquisou ', 'Gesucht nach: ', 'Gesucht nach ',
];
/** Suffix forms (German: "<title> angesehen", "<query> gesucht"). */
const WATCH_SUFFIXES = [' angesehen'];
const SEARCH_SUFFIXES = [' gesucht'];
/** Placeholder titles for removed / private videos. */
const REMOVED_RE =
  /(video that has been removed|video som har tagits bort|borttagen video|video that is no longer available|private video|privat video|video eliminado|vidéo supprimée|entferntes video|video,? das entfernt wurde)/i;

const YOUTUBE_FOLDER_RE = /^youtube( (and|och|og|und|y|et|e|en|i) youtube music)?$/i;
const HISTORY_FOLDER_RE = /^(history|historik|historikk|historie|historial|historique|verlauf|cronologia|geschiedenis|histórico)$/i;
const SUBSCRIPTION_RE = /(subscriptions|prenumerationer|abonnementer|abonnements|abos|abonnements|suscripciones|iscrizioni|abonnementen|inscrições)/i;
const MY_ACTIVITY_FOLDER_RE = /^(my activity|min aktivitet|mine aktiviteter|min aktivitet|meine aktivitäten|mi actividad|mon activité|le mie attività|mijn activiteit|minha atividade)$/i;
const SEARCH_PRODUCT_RE = /^(search|sök|søg|søk|suche|búsqueda|recherche|ricerca|zoeken|pesquisa)$/i;

type FileRole =
  | { role: 'history'; hint?: 'watch' | 'search' }
  | { role: 'subscriptions' }
  | { role: 'activity'; product: 'youtube' | 'search' };

function hintFromName(name: string): 'watch' | 'search' | undefined {
  if (/(search|sök|søg|søk|such|busq|recher|ricerc|zoek|pesq)/i.test(name)) return 'search';
  if (/(watch|titt|visning|sehen|visual|vision|kijk|guard|assist)/i.test(name)) return 'watch';
  return undefined;
}

function classifyFile(path: string): FileRole | undefined {
  const segs = path.split('/').filter(Boolean);
  const name = baseName(path);
  const ext = extName(path);
  const folders = segs.slice(0, -1);
  if (name === 'archive_browser.html') return undefined;

  // My Activity/<product>/MyActivity.json
  const ma = folders.findIndex((f) => MY_ACTIVITY_FOLDER_RE.test(f));
  if (ma >= 0 && (ext === 'json' || ext === 'html')) {
    const product = folders[ma + 1] ?? '';
    if (YOUTUBE_FOLDER_RE.test(product)) return { role: 'activity', product: 'youtube' };
    if (SEARCH_PRODUCT_RE.test(product)) return { role: 'activity', product: 'search' };
    return undefined;
  }

  const inYouTube = folders.some((f) => YOUTUBE_FOLDER_RE.test(f));
  if (ext === 'csv' && SUBSCRIPTION_RE.test(name) && (inYouTube || folders.length === 0 || SUBSCRIPTION_RE.test(folders[folders.length - 1] ?? ''))) {
    return { role: 'subscriptions' };
  }
  if (ext !== 'json' && ext !== 'html') return undefined;
  if (inYouTube && folders.some((f) => HISTORY_FOLDER_RE.test(f))) return { role: 'history', hint: hintFromName(name) };
  // Loose files uploaded on their own.
  if (/^(watch|search)-history\.(json|html)$/.test(name)) return { role: 'history', hint: hintFromName(name) };
  if (/^(myactivity|my activity|minaktivitet|min aktivitet)\.(json|html)$/.test(name) && folders.length === 0) {
    return { role: 'activity', product: 'youtube' }; // header decides per item
  }
  return undefined;
}

// ── Raw activity items (JSON or HTML) ───────────────────────────────

interface RawItem {
  header?: string;
  /** Full title text, e.g. "Watched Some video". */
  title?: string;
  /** Text of the link inside the title (HTML only), i.e. the bare video title / query. */
  linkText?: string;
  titleUrl?: string;
  channel?: string;
  channelUrl?: string;
  time?: string;
  zoneKnown?: boolean;
  ads: boolean;
}

function itemsFromJson(data: unknown): RawItem[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const out: RawItem[] = [];
  for (const it of data) {
    if (!isRecord(it)) continue;
    const subs = Array.isArray(it.subtitles) ? it.subtitles.filter(isRecord) : [];
    const details = Array.isArray(it.details) ? it.details.filter(isRecord) : [];
    out.push({
      header: str(it.header),
      title: str(it.title),
      titleUrl: str(it.titleUrl),
      channel: str(subs[0]?.name),
      channelUrl: str(subs[0]?.url),
      time: toIso(it.time),
      zoneKnown: true,
      ads: details.some((d) => /google ads/i.test(String(d.name ?? ''))),
    });
  }
  return out;
}

const ANCHOR_RE = /<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;

/** Parse the My Activity HTML format without a DOM (works in node and workers). */
export function itemsFromHtml(html: string): RawItem[] {
  const out: RawItem[] = [];
  const chunks = html.split(/<div class="outer-cell/i).slice(1);
  for (const chunk of chunks) {
    const headerM = /<p class="mdl-typography--title">([\s\S]*?)<\/p>/i.exec(chunk);
    let content: string | undefined;
    let caption = '';
    const cellRe = /<div class="(content-cell[^"]*)">([\s\S]*?)<\/div>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(chunk))) {
      const cls = cm[1];
      if (/caption/.test(cls)) caption += cm[2];
      else if (content === undefined && /body-1/.test(cls) && !/text-right/.test(cls)) content = cm[2];
    }
    if (content === undefined) continue;
    const lines = content.split(/<br\s*\/?>/i).map((l) => l.trim()).filter((l) => htmlToText(l) !== '');
    if (!lines.length) continue;

    const item: RawItem = { header: headerM ? htmlToText(headerM[1]) : undefined, ads: /google ads/i.test(htmlToText(caption)) };
    const first = lines[0];
    const a = ANCHOR_RE.exec(first);
    item.title = htmlToText(first);
    if (a) {
      item.titleUrl = decodeEntities(a[1]);
      item.linkText = htmlToText(a[2]);
    }
    // The time is the last line without a link; a channel is a later line with a link.
    let timeLine: string | undefined;
    for (let i = lines.length - 1; i >= 1; i--) {
      if (!/<a\s/i.test(lines[i])) {
        timeLine = htmlToText(lines[i]);
        break;
      }
    }
    for (let i = 1; i < lines.length; i++) {
      const ch = ANCHOR_RE.exec(lines[i]);
      if (ch) {
        item.channelUrl = decodeEntities(ch[1]);
        item.channel = htmlToText(ch[2]);
        break;
      }
    }
    if (timeLine) {
      const d = parseTakeoutDate(timeLine);
      if (d) {
        item.time = d.iso;
        item.zoneKnown = d.zoneKnown;
      }
    }
    out.push(item);
  }
  return out;
}

// ── Item → event ────────────────────────────────────────────────────

function stripAffix(title: string, prefixes: string[], suffixes: string[]): string | undefined {
  const t = title.replace(/[  ]/g, ' ');
  for (const p of prefixes) if (t.startsWith(p)) return t.slice(p.length).trim();
  for (const s of suffixes) if (t.endsWith(s)) return t.slice(0, -s.length).trim();
  return undefined;
}

export function youtubeVideoId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m =
    /[?&]v=([A-Za-z0-9_-]{6,})/.exec(url) ??
    /youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(url) ??
    /\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/.exec(url);
  return m ? m[1] : undefined;
}

function queryParam(url: string, name: string): string | undefined {
  const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() || undefined;
  } catch {
    return m[1].replace(/\+/g, ' ').trim() || undefined;
  }
}

const isYtSearchUrl = (u?: string) => !!u && /youtube\.com\/results\?/i.test(u);
const isYtWatchUrl = (u?: string) => !!u && /(youtube\.com\/(watch|shorts\/|live\/)|youtu\.be\/)/i.test(u);
const isGoogleSearchUrl = (u?: string) => !!u && /\/\/(www\.)?google\.[a-z.]+\/search\?/i.test(u);

function looksLikeUrl(s: string | undefined): boolean {
  return !!s && /^https?:\/\//i.test(s);
}

interface Counters {
  skipped: number;
  noTime: number;
  unknownZone: number;
}

function youtubeEvent(item: RawItem, hint: 'watch' | 'search' | undefined, c: Counters): DriftEvent | undefined {
  if (!item.time) {
    c.noTime++;
    return undefined;
  }
  if (item.zoneKnown === false) c.unknownZone++;
  const title = item.title ?? '';
  const searchText = stripAffix(title, SEARCH_PREFIXES, SEARCH_SUFFIXES);
  const watchText = stripAffix(title, WATCH_PREFIXES, WATCH_SUFFIXES);

  const isSearch = isYtSearchUrl(item.titleUrl) || (searchText !== undefined && !isYtWatchUrl(item.titleUrl));
  if (isSearch || (hint === 'search' && !isYtWatchUrl(item.titleUrl) && watchText === undefined)) {
    const query =
      (item.titleUrl ? queryParam(item.titleUrl, 'search_query') : undefined) ?? item.linkText ?? searchText ?? (title || undefined);
    if (!query) {
      c.skipped++;
      return undefined;
    }
    return withId({ platform: 'youtube', kind: 'search', time: item.time, query, url: item.titleUrl, fromAds: item.ads || undefined });
  }

  const removed = REMOVED_RE.test(title);
  // No file-name hint for watches: items without URL or known prefix are surveys, posts etc.
  const isWatch = isYtWatchUrl(item.titleUrl) || watchText !== undefined || removed;
  if (!isWatch) {
    c.skipped++;
    return undefined;
  }
  let videoTitle: string | undefined = item.linkText ?? watchText ?? (item.titleUrl ? title : undefined);
  if (removed || looksLikeUrl(videoTitle) || videoTitle === '') videoTitle = undefined;
  const ev: Omit<DriftEvent, 'id'> = {
    platform: 'youtube',
    kind: item.ads ? 'ad' : 'watch',
    time: item.time,
    title: videoTitle,
    url: item.titleUrl,
    itemId: youtubeVideoId(item.titleUrl),
  };
  if (item.channel) ev.channel = item.channelUrl ? { name: item.channel, url: item.channelUrl } : { name: item.channel };
  if (item.ads) ev.fromAds = true;
  return withId(ev);
}

function googleSearchEvent(item: RawItem, c: Counters): DriftEvent | undefined {
  if (!item.time) {
    c.noTime++;
    return undefined;
  }
  const title = item.title ?? '';
  const searchText = stripAffix(title, SEARCH_PREFIXES, SEARCH_SUFFIXES);
  const fromUrl = isGoogleSearchUrl(item.titleUrl) && item.titleUrl ? queryParam(item.titleUrl, 'q') : undefined;
  // "Visited <page>" and other non-search items are skipped.
  if (searchText === undefined && !fromUrl) {
    c.skipped++;
    return undefined;
  }
  const query = fromUrl ?? item.linkText ?? searchText;
  if (!query) return undefined;
  if (item.zoneKnown === false) c.unknownZone++;
  return withId({ platform: 'google_search', kind: 'search', time: item.time, query, url: item.titleUrl });
}

const isSearchHeader = (h?: string) => !!h && SEARCH_PRODUCT_RE.test(h.trim());
const isYouTubeHeader = (h?: string) => !!h && /youtube/i.test(h);

// ── Subscriptions ───────────────────────────────────────────────────

function followsFromCsv(text: string): FollowRecord[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  // Columns: Channel Id, Channel Url, Channel Title (header localised, order stable).
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = !rows[0].some((f) => /^https?:\/\//.test(f));
  let urlCol = header.findIndex((h) => /url|webbadress|adresse|link/.test(h));
  let titleCol = header.findIndex((h) => /title|titel|tittel|título|titre|titolo|naam|name/.test(h));
  if (urlCol < 0) urlCol = 1;
  if (titleCol < 0 || titleCol === urlCol) titleCol = 2;
  const out: FollowRecord[] = [];
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const name = (r[titleCol] ?? '').trim();
    const url = (r[urlCol] ?? '').trim();
    if (!name && !url) continue;
    out.push({ platform: 'youtube', name: name || url, url: url || undefined });
  }
  return out;
}

// ── Parser ──────────────────────────────────────────────────────────

async function readItems(file: ExportFile, warnings: string[]): Promise<RawItem[] | undefined> {
  if (extName(file.path) === 'html') {
    const html = await readText(file, warnings);
    if (html === undefined) return undefined;
    const items = itemsFromHtml(html);
    if (!items.length && !/outer-cell/.test(html)) {
      warnings.push(`${file.path} does not look like a Takeout activity file, skipped.`);
      return undefined;
    }
    return items;
  }
  const data = await readJson(file, warnings);
  if (data === undefined) return undefined;
  const items = itemsFromJson(data);
  if (!items) warnings.push(`${file.path} has an unexpected structure, skipped.`);
  return items;
}

export const youtubeParser: ExportParser = {
  id: 'youtube',
  label: 'YouTube (Google Takeout)',

  detect(files) {
    return files.some((f) => classifyFile(f.path) !== undefined);
  },

  async parse(files): Promise<ParseResult> {
    const res = emptyResult('youtube');
    const c: Counters = { skipped: 0, noTime: 0, unknownZone: 0 };
    let events: DriftEvent[] = [];
    let follows: FollowRecord[] = [];
    let sawWatch = false;
    let sawSearch = false;
    let sawSubs = false;
    let htmlUsed = false;

    for (const file of files) {
      const role = classifyFile(file.path);
      if (!role) continue;

      if (role.role === 'subscriptions') {
        const text = await readText(file, res.warnings);
        if (text === undefined) continue;
        follows = follows.concat(followsFromCsv(text));
        sawSubs = true;
        res.filesUsed.push(file.path);
        continue;
      }

      const items = await readItems(file, res.warnings);
      if (!items) continue;
      if (extName(file.path) === 'html') htmlUsed = true;
      res.filesUsed.push(file.path);
      for (const item of items) {
        let ev: DriftEvent | undefined;
        if (role.role === 'activity' && (role.product === 'search' || isSearchHeader(item.header)) && !isYouTubeHeader(item.header)) {
          ev = googleSearchEvent(item, c);
        } else {
          ev = youtubeEvent(item, role.role === 'history' ? role.hint : undefined, c);
        }
        if (!ev) continue;
        if (ev.platform === 'youtube' && ev.kind === 'search') sawSearch = true;
        if (ev.platform === 'youtube' && ev.kind !== 'search') sawWatch = true;
        events.push(ev);
      }
    }

    events = dedupeEvents(events);
    res.events = events;
    res.follows = dedupeFollows(follows);

    const hasYouTube = events.some((e) => e.platform === 'youtube') || res.follows.length > 0;
    const hasGoogle = events.some((e) => e.platform === 'google_search');
    res.platform = hasYouTube && hasGoogle ? 'mixed' : hasGoogle ? 'google_search' : 'youtube';

    if (!res.filesUsed.length) {
      res.warnings.push('No YouTube history files found. Make sure the export includes YouTube "history" in JSON or HTML format.');
    } else if (hasYouTube || !hasGoogle) {
      if (!sawWatch) res.warnings.push('No YouTube watch history found (watch-history.json). Is "YouTube watch history" turned on, and was "history" included in the export?');
      if (!sawSearch) res.warnings.push('No YouTube search history found (search-history.json), searches skipped.');
      if (!sawSubs) res.warnings.push('subscriptions.csv not found, subscriptions skipped.');
    }
    if (htmlUsed) res.warnings.push('History was in HTML format. JSON is more reliable: choose "Multiple formats" → History: JSON in Takeout next time.');
    if (c.unknownZone) res.warnings.push(`${c.unknownZone} items had no recognisable time zone; UTC was assumed.`);
    if (c.noTime) res.warnings.push(`${c.noTime} items without a readable date were skipped.`);
    if (c.skipped) res.warnings.push(`${c.skipped} items that were not videos or searches were skipped.`);
    return res;
  },
};
