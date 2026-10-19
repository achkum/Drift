// OWNER: sync agent. Test helpers: a cookie jar and a fake Google backend.
import type { FetchLike } from './api';
import type { Deps } from './handlers';

export const ORIGIN = 'http://localhost:3000';
export const REAL_ENV = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'shh-secret', DRIFT_TOKEN_KEY: '22'.repeat(32) };

export class CookieJar {
  cookies = new Map<string, string>();
  raw: string[] = [];
  apply(res: Response): Response {
    for (const c of res.headers.getSetCookie()) {
      this.raw.push(c);
      const [pair, ...attrs] = c.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (attrs.some((a) => /^max-age=0$/i.test(a))) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  /** The Set-Cookie line last written for `name`. */
  lastSet(name: string): string | undefined {
    return [...this.raw].reverse().find((c) => c.startsWith(`${name}=`));
  }
}

export function makeReq(path: string, jar?: CookieJar, init: RequestInit & { headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (jar && jar.cookies.size) headers.cookie = jar.header();
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

export interface FakeCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface FakeGoogle {
  fetch: FetchLike;
  calls: FakeCall[];
  /** Override a response for a URL substring (first match wins). */
  responders: { match: string; respond: (call: FakeCall) => Response | Promise<Response> }[];
}

export function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function fakeGoogle(opts: { scope?: string; jobStates?: Record<string, unknown> } = {}): FakeGoogle {
  const calls: FakeCall[] = [];
  let jobN = 0;
  let tokenN = 0;
  const g: FakeGoogle = {
    calls,
    responders: [],
    fetch: async (input, init) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const call: FakeCall = { url: String(input), method: init?.method ?? 'GET', headers, body: typeof init?.body === 'string' ? init.body : '' };
      calls.push(call);
      for (const r of g.responders) if (call.url.includes(r.match)) return r.respond(call);
      if (call.url === 'https://oauth2.googleapis.com/token') {
        const p = new URLSearchParams(call.body);
        tokenN++;
        if (p.get('grant_type') === 'authorization_code') {
          return jsonRes({
            access_token: `at-${tokenN}`,
            expires_in: 3599,
            refresh_token: 'rt-secret-1',
            refresh_token_expires_in: 2592000,
            scope:
              opts.scope ??
              'https://www.googleapis.com/auth/dataportability.myactivity.youtube https://www.googleapis.com/auth/dataportability.myactivity.search https://www.googleapis.com/auth/dataportability.youtube.subscriptions',
            token_type: 'Bearer',
          });
        }
        return jsonRes({ access_token: `at-${tokenN}`, expires_in: 3599, token_type: 'Bearer' });
      }
      if (call.url.endsWith('/v1/accessType:check')) return jsonRes({ timeBasedResources: ['myactivity.youtube', 'myactivity.search', 'youtube.subscriptions'] });
      if (call.url.endsWith('/v1/portabilityArchive:initiate')) return jsonRes({ archiveJobId: `job-${++jobN}`, accessType: 'ACCESS_TYPE_TIME_BASED' });
      const m = /\/v1\/archiveJobs\/([^/]+)\/portabilityArchiveState$/.exec(call.url);
      if (m) {
        const id = decodeURIComponent(m[1]);
        return jsonRes(
          opts.jobStates?.[id] ?? {
            name: `archiveJobs/${id}/portabilityArchiveState`,
            state: 'COMPLETE',
            urls: [`https://storage.googleapis.com/dataportability-bucket/${id}.zip?X-Goog-Signature=abc`],
            exportTime: '2026-10-18T10:00:00Z',
          },
        );
      }
      if (call.url.endsWith('/v1/authorization:reset')) return jsonRes({});
      return jsonRes({ error: { code: 404, status: 'NOT_FOUND', message: 'unknown' } }, 404);
    },
  };
  return g;
}

export function deps(env: Record<string, string | undefined>, fetchImpl: FetchLike, clock = { now: Date.parse('2026-10-18T12:00:00Z') }): Deps {
  return { env, fetch: fetchImpl, now: () => clock.now };
}
