import { beforeEach, describe, expect, it } from 'vitest';
import {
  HEADER, exportPublicKeys, generateDeviceKeys, inviteTokenHash, joinProof, memberIdFor, newToken, sealEnvelope, signAdmission,
  signRequest, type DeviceKeys,
} from '../crypto';
import type { PublicKeys } from '../types';
import { createHouseholdHandler, type HouseholdHandler } from './handler';
import { createSqliteStore } from './sqliteStore';
import { createMemoryStore, type HouseholdStore } from './store';

const BASE = 'http://test/api/household';
let clock = Date.parse('2026-10-18T12:00:00Z');

interface Dev { keys: DeviceKeys; pub: PublicKeys; id: string }
async function device(): Promise<Dev> {
  const keys = await generateDeviceKeys();
  const pub = await exportPublicKeys(keys);
  return { keys, pub, id: await memberIdFor(pub) };
}

async function signed(d: Dev, method: string, path: string, body?: unknown, opts: { ts?: number; headers?: Record<string, string> } = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  const u = new URL(BASE + path);
  const h = await signRequest(d.keys.ecdsa.privateKey, d.id, method, u.pathname + u.search, text, opts.ts ?? clock);
  return new Request(BASE + path, { method, headers: { ...h, ...opts.headers }, body: text || undefined });
}

async function call(handler: HouseholdHandler, req: Request) {
  const res = await handler(req);
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

for (const kind of ['memory', 'sqlite'] as const) {
  describe(`household mailbox (${kind} store)`, () => {
    let store: HouseholdStore;
    let handler: HouseholdHandler;
    let owner: Dev, teen: Dev, stranger: Dev;
    let householdId: string;

    async function invite(expiresAt = new Date(clock + 7 * 864e5).toISOString()) {
      const token = newToken();
      const tokenHash = await inviteTokenHash(token);
      const r = await call(handler, await signed(owner, 'POST', '/invites', { tokenHash, expiresAt, welcome: 'sealed.blob' }));
      return { token, tokenHash, r };
    }
    async function join(d: Dev, token: string) {
      const tokenHash = await inviteTokenHash(token);
      return call(handler, await signed(d, 'POST', '/invites/redeem', { tokenHash, keys: d.pub, joinProof: await joinProof(token, tokenHash, d.id, d.pub) }));
    }

    beforeEach(async () => {
      clock = Date.parse('2026-10-18T12:00:00Z');
      store = kind === 'memory' ? createMemoryStore() : await createSqliteStore(':memory:');
      handler = createHouseholdHandler({ store, now: () => clock, rateLimit: { burst: 1000, perSecond: 100 } });
      [owner, teen, stranger] = await Promise.all([device(), device(), device()]);
      const r = await call(handler, await signed(owner, 'POST', '/households', { keys: owner.pub }));
      expect(r.status).toBe(201);
      householdId = r.body.householdId;
    });

    it('rejects unsigned, badly signed, stale and replayed requests', async () => {
      expect((await call(handler, new Request(`${BASE}/members`))).status).toBe(401);
      const tampered = await signed(owner, 'GET', '/members');
      const h = new Headers(tampered.headers); h.set(HEADER.sig, h.get(HEADER.sig)!.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')));
      expect((await call(handler, new Request(tampered.url, { headers: h }))).body.error.code).toBe('bad_signature');
      // Signed by someone else's key under the owner's id.
      const imp = await signRequest(stranger.keys.ecdsa.privateKey, owner.id, 'GET', '/api/household/members', '', clock);
      expect((await call(handler, new Request(`${BASE}/members`, { headers: imp }))).body.error.code).toBe('bad_signature');
      // Older than 5 minutes.
      expect((await call(handler, await signed(owner, 'GET', '/members', undefined, { ts: clock - 5 * 60_000 - 1 }))).body.error.code).toBe('stale');
      expect((await call(handler, await signed(owner, 'GET', '/members', undefined, { ts: clock + 5 * 60_000 + 1 }))).body.error.code).toBe('stale');
      // Exact replay.
      const req = await signed(owner, 'GET', '/members');
      const again = new Request(req.url, { headers: req.headers });
      expect((await call(handler, req)).status).toBe(200);
      expect((await call(handler, again)).body.error.code).toBe('replay');
      // Body swapped under a valid signature.
      const put = await signed(owner, 'POST', '/invites', { tokenHash: 'a'.repeat(43), expiresAt: new Date(clock + 1000).toISOString(), welcome: 'x' });
      const swapped = new Request(put.url, { method: 'POST', headers: put.headers, body: JSON.stringify({ tokenHash: 'b'.repeat(43), expiresAt: new Date(clock + 1000).toISOString(), welcome: 'x' }) });
      expect((await call(handler, swapped)).body.error.code).toBe('bad_signature');
    });

    it('registration requires keys that hash to the member id', async () => {
      const r = await call(handler, await signed(stranger, 'POST', '/households', { keys: owner.pub }));
      expect(r.body.error.code).toBe('bad_identity');
      expect((await call(handler, await signed(owner, 'POST', '/households', { keys: owner.pub }))).body.error.code).toBe('already_member');
    });

    it('invites: owner only, expire after 7 days, single use', async () => {
      // Too long.
      expect((await invite(new Date(clock + 8 * 864e5).toISOString())).r.body.error.code).toBe('bad_expiry');
      const old = await invite();
      expect(old.r.status).toBe(201);
      // Non-members cannot create invites.
      expect((await call(handler, await signed(stranger, 'POST', '/invites', { tokenHash: 'x'.repeat(43), expiresAt: new Date(clock + 1000).toISOString(), welcome: 'w' }))).status).toBe(403);
      // Expired: refused, and pruned from the server.
      clock += 7 * 864e5 + 1;
      expect(['invite_expired', 'invite_not_found']).toContain((await join(teen, old.token)).body.error.code);
      expect(await store.getInvite(old.tokenHash)).toBeNull();
      // Just before expiry still works.
      const { token, tokenHash } = await invite();
      clock += 7 * 864e5 - 1;
      const ok = await join(teen, token);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ householdId, welcome: 'sealed.blob', owner: { memberId: owner.id, ecdh: owner.pub.ecdh } });
      expect((await join(stranger, token)).body.error.code).toBe('invite_used');
      expect((await store.getInvite(tokenHash))!.redeemedBy).toBe(teen.id);
      expect((await join(stranger, newToken())).body.error.code).toBe('invite_not_found');
    });

    it('stores only ciphertext and enforces mailbox access', async () => {
      const { token } = await invite();
      await join(teen, token);
      const members = await call(handler, await signed(owner, 'GET', '/members'));
      expect(members.body.members).toHaveLength(2);
      expect(members.body.members[1].joinProof).toBeTruthy();
      // Join proofs are only shown to the owner.
      const asTeen = await call(handler, await signed(teen, 'GET', '/members'));
      expect(asTeen.body.members[1].joinProof).toBeUndefined();
      // Admission must be a valid owner signature.
      expect((await call(handler, await signed(owner, 'POST', `/members/${teen.id}/admit`, { admission: 'bogus' }))).body.error.code).toBe('bad_admission');
      const admission = await signAdmission(owner.keys.ecdsa.privateKey, householdId, teen.id, teen.pub);
      expect((await call(handler, await signed(teen, 'POST', `/members/${teen.id}/admit`, { admission }))).status).toBe(403);
      expect((await call(handler, await signed(owner, 'POST', `/members/${teen.id}/admit`, { admission }))).status).toBe(200);

      const env = await sealEnvelope({ kind: 'summary', from: teen.id, to: owner.id, recipientEcdh: owner.pub.ecdh, senderSigningKey: teen.keys.ecdsa.privateKey, payload: { secret: 'dieting 19%' } });
      expect((await call(handler, await signed(teen, 'PUT', `/shares/summary/${owner.id}`, { envelope: env }))).status).toBe(200);
      // Addressing must match the path and the sender.
      expect((await call(handler, await signed(owner, 'PUT', `/shares/summary/${teen.id}`, { envelope: env }))).body.error.code).toBe('bad_envelope');
      expect((await call(handler, await signed(teen, 'PUT', `/shares/summary/${stranger.id}`, { envelope: { ...env, to: stranger.id } }))).status).toBe(404);
      const got = await call(handler, await signed(owner, 'GET', '/shares?kind=summary'));
      expect(got.body.shares).toHaveLength(1);
      expect(got.body.shares[0].envelope).toEqual(env);
      expect(JSON.stringify(got.body)).not.toContain('dieting');
      // The teen's inbox doesn't contain what the teen sent.
      expect((await call(handler, await signed(teen, 'GET', '/shares'))).body.shares).toHaveLength(0);
      // Revoke deletes the server copy.
      expect((await call(handler, await signed(teen, 'DELETE', `/shares/summary/${owner.id}`))).body.deleted).toBe(true);
      expect((await call(handler, await signed(owner, 'GET', '/shares?kind=summary'))).body.shares).toHaveLength(0);

      // Question notes: append, list, ack.
      const q = await sealEnvelope({ kind: 'question', from: owner.id, to: teen.id, recipientEcdh: teen.pub.ecdh, senderSigningKey: owner.keys.ecdsa.privateKey, payload: { question: 'Why?' } });
      const posted = await call(handler, await signed(owner, 'POST', `/notes/${teen.id}`, { envelope: q }));
      expect(posted.status).toBe(201);
      const inbox = await call(handler, await signed(teen, 'GET', '/notes'));
      expect(inbox.body.notes).toHaveLength(1);
      expect((await call(handler, await signed(owner, 'DELETE', `/notes/${posted.body.id}`))).body.deleted).toBe(false);
      expect((await call(handler, await signed(teen, 'DELETE', `/notes/${posted.body.id}`))).body.deleted).toBe(true);
    });

    it('leave, remove and delete wipe server data', async () => {
      const a = await invite();
      await join(teen, a.token);
      const b = await invite();
      await join(stranger, b.token);
      const env = await sealEnvelope({ kind: 'profile', from: teen.id, to: owner.id, recipientEcdh: owner.pub.ecdh, senderSigningKey: teen.keys.ecdsa.privateKey, payload: {} });
      await call(handler, await signed(teen, 'PUT', `/shares/profile/${owner.id}`, { envelope: env }));
      // Only the owner removes others; the owner can't "leave".
      expect((await call(handler, await signed(teen, 'DELETE', `/members/${stranger.id}`))).status).toBe(403);
      expect((await call(handler, await signed(owner, 'DELETE', '/members/me'))).body.error.code).toBe('owner_cannot_leave');
      expect((await call(handler, await signed(teen, 'DELETE', '/members/me'))).status).toBe(200);
      expect(await store.listShares(owner.id)).toHaveLength(0);
      expect((await call(handler, await signed(teen, 'GET', '/members'))).status).toBe(403);
      expect((await call(handler, await signed(owner, 'DELETE', `/members/${stranger.id}`))).status).toBe(200);
      expect((await call(handler, await signed(owner, 'DELETE', '/households/me'))).status).toBe(200);
      expect(await store.getHousehold(householdId)).toBeNull();
      expect(await store.getMember(owner.id)).toBeNull();
    });

    it('rate limits per member', async () => {
      const limited = createHouseholdHandler({ store, now: () => clock, rateLimit: { burst: 3, perSecond: 0.001 } });
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await call(limited, await signed(owner, 'GET', '/members'))).status);
      expect(codes).toEqual([200, 200, 200, 429, 429]);
    });
  });
}
