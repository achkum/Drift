// Strict allow-list for the opt-in title lookup. Only canonical, rebuilt video links ever leave the
// device: we never forward the URL from the export as-is (it can carry share/tracking parameters).
import type { DriftEvent } from '@/lib/types';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TT_ID = /^\d{8,21}$/;

function youtubeId(e: Pick<DriftEvent, 'itemId' | 'url'>): string | undefined {
  if (e.itemId && YT_ID.test(e.itemId)) return e.itemId;
  const u = parseHttpUrl(e.url);
  if (!u) return undefined;
  const host = u.hostname.toLowerCase();
  let id: string | null | undefined;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    id = u.searchParams.get('v') ?? /^\/(?:shorts|live|embed)\/([^/]+)/.exec(u.pathname)?.[1];
  }
  return id && YT_ID.test(id) ? id : undefined;
}

function tiktokId(e: Pick<DriftEvent, 'itemId' | 'url'>): string | undefined {
  if (e.itemId && TT_ID.test(e.itemId)) return e.itemId;
  const u = parseHttpUrl(e.url);
  if (!u) return undefined;
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)tiktok(v)?\.com$/.test(host)) return undefined;
  const id = /\/(?:video|v)\/(\d+)/.exec(u.pathname)?.[1];
  return id && TT_ID.test(id) ? id : undefined;
}

function parseHttpUrl(s: string | undefined): URL | undefined {
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : undefined;
  } catch {
    return undefined;
  }
}

/** The canonical public video link for an event, or undefined when it isn't a YouTube/TikTok video. */
export function canonicalVideoUrl(e: Pick<DriftEvent, 'platform' | 'itemId' | 'url'>): string | undefined {
  if (e.platform === 'youtube') {
    const id = youtubeId(e);
    return id ? `https://www.youtube.com/watch?v=${id}` : undefined;
  }
  if (e.platform === 'tiktok') {
    const id = tiktokId(e);
    return id ? `https://www.tiktok.com/@/video/${id}` : undefined;
  }
  return undefined;
}

/**
 * The oEmbed request for a canonical video link. Returns undefined for anything that isn't exactly
 * a link produced by canonicalVideoUrl, so no other data can be sent.
 */
export function oembedEndpoint(videoUrl: string): string | undefined {
  const yt = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(videoUrl);
  if (yt) return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`;
  const tt = /^https:\/\/www\.tiktok\.com\/@\/video\/(\d{8,21})$/.exec(videoUrl);
  if (tt) return `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  return undefined;
}

export interface OembedInfo {
  title?: string;
  authorName?: string;
  authorUrl?: string;
}

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

/** Picks the fields we use from an oEmbed response; author URL only when it points at the same platform. */
export function readOembed(json: unknown): OembedInfo {
  if (!json || typeof json !== 'object') return {};
  const o = json as Record<string, unknown>;
  const authorUrl = clean(o.author_url, 300);
  const okAuthorUrl = authorUrl && /^https:\/\/(www\.)?(youtube|tiktok)\.com\//.test(authorUrl) ? authorUrl : undefined;
  return { title: clean(o.title, 300), authorName: clean(o.author_name, 120), authorUrl: okAuthorUrl };
}
