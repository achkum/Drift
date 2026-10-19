// OWNER: household agent. The household mailbox: a dumb, authenticated relay.
// Framework-agnostic: (Request) => Promise<Response>. Mounted by
// src/app/api/household/[...path]/route.ts and called directly in tests.
//
// Every request is signed by the device's ECDSA key (see crypto.ts signRequest).
// The server verifies who is talking and enforces membership, but it cannot
// read anything: summaries, profiles and question notes are end-to-end
// encrypted envelopes, and the invite welcome is sealed with the invite token,
// which only travels in URL fragments.
import {
  HEADER, REQUEST_MAX_SKEW_MS, isEnvelope, isValidPublicKey, memberIdFor, requestSigningBytes,
  verifyAdmission, verifyBytes, type Envelope,
} from '../crypto';
import { b64u, randomBytes } from '../encoding';
import { INVITE_TTL_MS } from '../invite';
import type { PublicKeys } from '../types';
import type { HouseholdStore, MemberRow } from './store';

export const MAX_MEMBERS = 6;
export const MAX_OPEN_INVITES = 10;
export const MAX_BODY_BYTES = 300 * 1024;
export const NOTE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_NOTES_PER_RECIPIENT = 500;

export interface HandlerOptions {
  store: HouseholdStore;
  /** Path prefix the routes are mounted under. Default '/api/household'. */
  basePath?: string;
  now?: () => number;
  /** Token bucket per member: burst size and refill per second. */
  rateLimit?: { burst: number; perSecond: number };
}

export type HouseholdHandler = (req: Request) => Promise<Response>;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const ID = /^[A-Za-z0-9_-]{16,64}$/;

export function createHouseholdHandler(opts: HandlerOptions): HouseholdHandler {
  const { store } = opts;
  const base = (opts.basePath ?? '/api/household').replace(/\/$/, '');
  const now = opts.now ?? (() => Date.now());
  const rl = opts.rateLimit ?? { burst: 120, perSecond: 2 };
  const nonces = new Map<string, number>();
  const buckets = new Map<string, { tokens: number; at: number }>();
  let lastPrune = 0;

  function takeToken(key: string) {
    const t = now();
    const b = buckets.get(key) ?? { tokens: rl.burst, at: t };
    b.tokens = Math.min(rl.burst, b.tokens + ((t - b.at) / 1000) * rl.perSecond);
    b.at = t;
    if (b.tokens < 1) { buckets.set(key, b); throw new HttpError(429, 'rate_limited', 'Too many requests. Try again in a moment.'); }
    b.tokens -= 1;
    buckets.set(key, b);
  }

  function rememberNonce(memberId: string, nonce: string) {
    const t = now();
    if (nonces.size > 10_000) for (const [k, exp] of nonces) if (exp < t) nonces.delete(k);
    const key = `${memberId}|${nonce}`;
    if ((nonces.get(key) ?? 0) > t) throw new HttpError(401, 'replay', 'This request was already used.');
    nonces.set(key, t + 2 * REQUEST_MAX_SKEW_MS);
  }

  async function maybePrune() {
    const t = now();
    if (t - lastPrune < 10 * 60 * 1000) return;
    lastPrune = t;
    await store.prune(new Date(t).toISOString(), new Date(t - NOTE_RETENTION_MS).toISOString());
  }

  /** Verifies the signature. `registering` keys come from the body for first contact. */
  async function authenticate(req: Request, path: string, body: string, registering?: PublicKeys): Promise<{ memberId: string; member: MemberRow | null }> {
    const memberId = req.headers.get(HEADER.member) ?? '';
    const ts = req.headers.get(HEADER.ts) ?? '';
    const nonce = req.headers.get(HEADER.nonce) ?? '';
    const sig = req.headers.get(HEADER.sig) ?? '';
    if (!ID.test(memberId) || !/^\d{1,16}$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !sig) {
      throw new HttpError(401, 'unsigned', 'Request is not signed.');
    }
    if (Math.abs(now() - Number(ts)) > REQUEST_MAX_SKEW_MS) throw new HttpError(401, 'stale', 'Request time is too far from server time.');
    takeToken(memberId);
    let ecdsa: string;
    let member: MemberRow | null = null;
    if (registering) {
      if (!isValidPublicKey(registering.ecdh) || !isValidPublicKey(registering.ecdsa)) throw new HttpError(400, 'bad_keys', 'Invalid public keys.');
      if ((await memberIdFor(registering)) !== memberId) throw new HttpError(401, 'bad_identity', 'Member id does not match keys.');
      ecdsa = registering.ecdsa;
    } else {
      member = await store.getMember(memberId);
      if (!member) throw new HttpError(403, 'not_member', 'Not in a household.');
      ecdsa = member.ecdsa;
    }
    const ok = await verifyBytes(ecdsa, await requestSigningBytes(req.method, path, ts, nonce, body), sig);
    if (!ok) throw new HttpError(401, 'bad_signature', 'Signature check failed.');
    rememberNonce(memberId, nonce);
    return { memberId, member };
  }

  const parse = (body: string): Record<string, unknown> => {
    if (!body) return {};
    try {
      const v = JSON.parse(body);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
      return v;
    } catch { throw new HttpError(400, 'bad_json', 'Body must be a JSON object.'); }
  };
  const keysOf = (v: unknown): PublicKeys => {
    const k = (v ?? {}) as Record<string, unknown>;
    return { ecdh: String(k.ecdh ?? ''), ecdsa: String(k.ecdsa ?? '') };
  };
  const requireMember = (m: MemberRow | null): MemberRow => {
    if (!m) throw new HttpError(403, 'not_member', 'Not in a household.');
    return m;
  };

  async function checkEnvelope(env: unknown, me: MemberRow, recipient: string, kind: Envelope['kind']): Promise<Envelope> {
    if (!isEnvelope(env)) throw new HttpError(400, 'bad_envelope', 'Not an envelope.');
    if (env.from !== me.memberId || env.to !== recipient || env.kind !== kind) throw new HttpError(400, 'bad_envelope', 'Envelope addressing does not match.');
    if (recipient === me.memberId) throw new HttpError(400, 'bad_recipient', 'Cannot send to yourself.');
    const r = await store.getMember(recipient);
    if (!r || r.householdId !== me.householdId) throw new HttpError(404, 'no_recipient', 'Recipient is not in your household.');
    return env;
  }

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    if (!url.pathname.startsWith(base + '/')) throw new HttpError(404, 'not_found', 'Not found.');
    const parts = url.pathname.slice(base.length + 1).split('/').filter(Boolean).map(decodeURIComponent);
    const method = req.method.toUpperCase();
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Body too large.');
    const body = method === 'GET' || method === 'HEAD' ? '' : await req.text();
    if (body.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Body too large.');
    const t = now();
    const nowIso = new Date(t).toISOString();
    await maybePrune();
    const [a, b, c] = parts;

    // ── Registration (first contact; keys travel in the body) ──
    if (method === 'POST' && a === 'households' && !b) {
      const data = parse(body);
      const keys = keysOf(data.keys);
      const { memberId } = await authenticate(req, path, body, keys);
      if (await store.getMember(memberId)) throw new HttpError(409, 'already_member', 'This device is already in a household.');
      const id = b64u(randomBytes(16));
      await store.createHousehold({ id, ownerId: memberId, createdAt: nowIso }, {
        householdId: id, memberId, ecdh: keys.ecdh, ecdsa: keys.ecdsa, joinedAt: nowIso, isOwner: true,
        inviteHash: null, joinProof: null, admission: null,
      });
      return json(201, { householdId: id, memberId });
    }
    if (method === 'POST' && a === 'invites' && b === 'redeem') {
      const data = parse(body);
      const keys = keysOf(data.keys);
      const { memberId } = await authenticate(req, path, body, keys);
      const tokenHash = String(data.tokenHash ?? '');
      const joinProof = String(data.joinProof ?? '');
      if (!ID.test(tokenHash) || !/^[A-Za-z0-9_-]{43}$/.test(joinProof)) throw new HttpError(400, 'bad_request', 'Missing invite.');
      if (await store.getMember(memberId)) throw new HttpError(409, 'already_member', 'This device is already in a household.');
      const inv = await store.getInvite(tokenHash);
      if (!inv) throw new HttpError(404, 'invite_not_found', 'This invite does not exist or was cancelled.');
      if (inv.redeemedBy) throw new HttpError(410, 'invite_used', 'This invite was already used.');
      if (inv.expiresAt < nowIso) throw new HttpError(410, 'invite_expired', 'This invite has expired. Ask for a new one.');
      const hh = await store.getHousehold(inv.householdId);
      if (!hh) throw new HttpError(410, 'household_gone', 'This household no longer exists.');
      if ((await store.listMembers(hh.id)).length >= MAX_MEMBERS) throw new HttpError(409, 'household_full', `A household has at most ${MAX_MEMBERS} members.`);
      if (!(await store.redeemInvite(tokenHash, memberId))) throw new HttpError(410, 'invite_used', 'This invite was already used.');
      await store.addMember({
        householdId: hh.id, memberId, ecdh: keys.ecdh, ecdsa: keys.ecdsa, joinedAt: nowIso, isOwner: false,
        inviteHash: tokenHash, joinProof, admission: null,
      });
      const owner = await store.getMember(hh.ownerId);
      return json(200, {
        householdId: hh.id, memberId, welcome: inv.welcome, expiresAt: inv.expiresAt,
        owner: owner ? { memberId: owner.memberId, ecdh: owner.ecdh, ecdsa: owner.ecdsa } : null,
      });
    }

    // ── Everything else: known members only ──
    const { member: m } = await authenticate(req, path, body);
    const me = requireMember(m);
    const hh = await store.getHousehold(me.householdId);
    if (!hh) throw new HttpError(410, 'household_gone', 'This household no longer exists.');
    const isOwner = hh.ownerId === me.memberId;

    if (a === 'households' && b === 'me' && method === 'DELETE') {
      if (!isOwner) throw new HttpError(403, 'owner_only', 'Only the owner can delete the household.');
      await store.deleteHousehold(hh.id);
      return json(200, { deleted: true });
    }

    if (a === 'invites' && !b && method === 'POST') {
      if (!isOwner) throw new HttpError(403, 'owner_only', 'Only the owner can invite.');
      const data = parse(body);
      const tokenHash = String(data.tokenHash ?? '');
      const welcome = String(data.welcome ?? '');
      const expiresAt = String(data.expiresAt ?? '');
      const exp = Date.parse(expiresAt);
      if (!ID.test(tokenHash) || !welcome || welcome.length > 8192 || !Number.isFinite(exp)) throw new HttpError(400, 'bad_request', 'Invalid invite.');
      if (exp <= t || exp > t + INVITE_TTL_MS + 60_000) throw new HttpError(400, 'bad_expiry', 'Invites expire within 7 days.');
      const open = (await store.listInvites(hh.id)).filter((i) => !i.redeemedBy && i.expiresAt >= nowIso);
      if (open.length >= MAX_OPEN_INVITES) throw new HttpError(409, 'too_many_invites', 'Too many open invites.');
      if (await store.getInvite(tokenHash)) throw new HttpError(409, 'exists', 'Invite exists.');
      await store.putInvite({ tokenHash, householdId: hh.id, createdBy: me.memberId, createdAt: nowIso, expiresAt: new Date(exp).toISOString(), welcome, redeemedBy: null });
      return json(201, { tokenHash, expiresAt: new Date(exp).toISOString() });
    }
    if (a === 'invites' && b && method === 'DELETE') {
      if (!isOwner) throw new HttpError(403, 'owner_only', 'Only the owner can cancel invites.');
      const inv = await store.getInvite(b);
      if (inv && inv.householdId === hh.id) await store.deleteInvite(b);
      return json(200, { deleted: !!inv });
    }

    if (a === 'members' && !b && method === 'GET') {
      const members = await store.listMembers(hh.id);
      return json(200, {
        householdId: hh.id, ownerId: hh.ownerId,
        members: members.map((x) => ({
          memberId: x.memberId, ecdh: x.ecdh, ecdsa: x.ecdsa, joinedAt: x.joinedAt, isOwner: x.isOwner, admission: x.admission,
          // Join proofs are only useful to the owner, who holds the invite tokens.
          ...(isOwner ? { inviteHash: x.inviteHash, joinProof: x.joinProof } : {}),
        })),
      });
    }
    if (a === 'members' && b && c === 'admit' && method === 'POST') {
      if (!isOwner) throw new HttpError(403, 'owner_only', 'Only the owner confirms members.');
      const target = await store.getMember(b);
      if (!target || target.householdId !== hh.id) throw new HttpError(404, 'no_member', 'No such member.');
      const admission = String(parse(body).admission ?? '');
      if (!(await verifyAdmission(me.ecdsa, hh.id, target.memberId, { ecdh: target.ecdh, ecdsa: target.ecdsa }, admission))) {
        throw new HttpError(400, 'bad_admission', 'Admission signature is invalid.');
      }
      await store.setAdmission(target.memberId, admission);
      return json(200, { admitted: true });
    }
    if (a === 'members' && b && !c && method === 'DELETE') {
      const target = b === 'me' ? me.memberId : b;
      if (target !== me.memberId && !isOwner) throw new HttpError(403, 'owner_only', 'Only the owner can remove members.');
      if (target === hh.ownerId) throw new HttpError(400, 'owner_cannot_leave', 'The owner deletes the household instead of leaving.');
      const t2 = await store.getMember(target);
      if (!t2 || t2.householdId !== hh.id) throw new HttpError(404, 'no_member', 'No such member.');
      await store.removeMember(target);
      return json(200, { removed: target });
    }

    if (a === 'shares' && (b === 'summary' || b === 'profile') && c && method === 'PUT') {
      const env = await checkEnvelope(parse(body).envelope, me, c, b);
      await store.putShare({ householdId: hh.id, sender: me.memberId, recipient: c, kind: b, body: JSON.stringify(env), createdAt: nowIso });
      return json(200, { stored: true });
    }
    if (a === 'shares' && (b === 'summary' || b === 'profile') && c && method === 'DELETE') {
      return json(200, { deleted: await store.deleteShare(me.memberId, c, b) });
    }
    if (a === 'shares' && !b && method === 'GET') {
      const kind = url.searchParams.get('kind');
      if (kind && kind !== 'summary' && kind !== 'profile') throw new HttpError(400, 'bad_kind', 'Unknown kind.');
      const rows = await store.listShares(me.memberId, (kind ?? undefined) as 'summary' | 'profile' | undefined);
      return json(200, { shares: rows.map((r) => ({ sender: r.sender, kind: r.kind, storedAt: r.createdAt, envelope: JSON.parse(r.body) })) });
    }

    if (a === 'notes' && b && method === 'POST') {
      const env = await checkEnvelope(parse(body).envelope, me, b, 'question');
      if ((await store.listNotes(b)).length >= MAX_NOTES_PER_RECIPIENT) throw new HttpError(429, 'mailbox_full', 'Their question log is full until they open Drift.');
      const id = b64u(randomBytes(16));
      await store.addNote({ id, householdId: hh.id, sender: me.memberId, recipient: b, body: JSON.stringify(env), createdAt: nowIso });
      return json(201, { id });
    }
    if (a === 'notes' && !b && method === 'GET') {
      const rows = await store.listNotes(me.memberId);
      return json(200, { notes: rows.map((r) => ({ id: r.id, sender: r.sender, storedAt: r.createdAt, envelope: JSON.parse(r.body) })) });
    }
    if (a === 'notes' && b && method === 'DELETE') {
      return json(200, { deleted: await store.deleteNote(b, me.memberId) });
    }

    throw new HttpError(404, 'not_found', 'Not found.');
  }

  return async (req) => {
    try {
      return await route(req);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: { code: e.code, message: e.message } });
      console.error('[household] internal error', e instanceof Error ? e.message : e);
      return json(500, { error: { code: 'internal', message: 'Something went wrong.' } });
    }
  };
}
