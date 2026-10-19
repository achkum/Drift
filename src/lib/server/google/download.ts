// OWNER: sync agent. GET /api/google/download?url=… — streaming pass-through for the archive.
//
// Why: the signed URLs Google returns point at Cloud Storage objects in a Google-owned bucket.
// A browser fetch() of those is cross-origin and only works if that bucket sends CORS headers,
// which Drift cannot configure. The client tries a direct download first and falls back here.
//
// Privacy: when this proxy is used, the archive bytes pass THROUGH the server in transit. They
// are streamed (never buffered to disk or memory as a whole), never logged, never stored.
import type { Deps } from './handlers';
import { defaultDeps } from './handlers';
import { getGoogleConfig } from './config';
import { errorJson, isSameOrigin, parseCookies, requestOrigin } from './http';
import { readSession } from './session';

const MAX_URL_LENGTH = 8192;
/** Hosts Google's signed archive URLs are served from. */
const ALLOWED_HOSTS = ['storage.googleapis.com'];
const ALLOWED_HOST_SUFFIXES = ['.storage.googleapis.com'];

/**
 * True when `raw` is an https URL on an allow-listed Google Cloud Storage host (default port,
 * no credentials). In mock mode the app's own /api/google/mock-archive/ path is also allowed.
 */
export function isAllowedDownloadUrl(raw: string, opts: { mock?: boolean; origin?: string } = {}): boolean {
  if (!raw || raw.length > MAX_URL_LENGTH) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (opts.mock && opts.origin && u.origin === opts.origin && u.pathname.startsWith('/api/google/mock-archive/')) return true;
  if (u.protocol !== 'https:' || u.port !== '') return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

const PASS_HEADERS = ['content-type', 'content-length', 'last-modified', 'etag'];

export async function handleDownload(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const c = getGoogleConfig(deps.env);
  if (!c.ok) return errorJson(503, 'not_configured', 'Google sync is not configured on this server.', { configured: false });
  const config = c.config;
  if (!isSameOrigin(req, config.appOrigin)) return errorJson(403, 'forbidden', 'Cross-site request refused.');
  // Only browsers with a Google connection can use the proxy, so it is not an open relay.
  if (!readSession(config, parseCookies(req), deps.now())) return errorJson(401, 'not_connected', 'Google is not connected.');

  const target = new URL(req.url).searchParams.get('url') ?? '';
  const origin = requestOrigin(req, config.appOrigin);
  if (!isAllowedDownloadUrl(target, { mock: config.mock, origin })) {
    return errorJson(400, 'invalid_request', 'Only Google Cloud Storage archive URLs can be downloaded.');
  }

  let upstream: Response;
  try {
    // redirect: 'error' so an allow-listed URL cannot bounce us to another host.
    upstream = await deps.fetch(target, { method: 'GET', redirect: 'error', cache: 'no-store', signal: req.signal });
  } catch {
    return errorJson(502, 'upstream_error', 'Could not download the archive from Google.');
  }
  if (!upstream.ok || !upstream.body) {
    // 400/403 from Cloud Storage usually means the signed URL expired (they last about 6 hours).
    const expired = upstream.status === 400 || upstream.status === 403;
    return errorJson(
      expired ? 410 : 502,
      'upstream_error',
      expired ? 'The download link expired. Start a new sync.' : `Google storage returned HTTP ${upstream.status}.`,
    );
  }
  const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  // fetch() decodes content-encoding, so the upstream length no longer matches in that case.
  const encoded = !!upstream.headers.get('content-encoding');
  for (const h of PASS_HEADERS) {
    if (h === 'content-length' && encoded) continue;
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('content-disposition', 'attachment');
  return new Response(upstream.body, { status: 200, headers });
}
