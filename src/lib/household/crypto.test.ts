import { describe, expect, it } from 'vitest';
import {
  EnvelopeError, admissionBytes, exportPublicKeys, generateDeviceKeys, inviteTokenHash, joinProof, memberIdFor, newToken,
  openEnvelope, openWelcome, requestSigningBytes, sealEnvelope, sealWelcome, signAdmission, signBytes, signRequest,
  verifyAdmission, verifyBytes, verifyJoinProof, HEADER, type Envelope,
} from './crypto';
import { b64u, canonicalJson, fromB64u, randomBytes, utf8 } from './encoding';
import { formatInviteFragment, parseInviteFragment } from './invite';

async function device() {
  const keys = await generateDeviceKeys();
  const pub = await exportPublicKeys(keys);
  return { keys, pub, id: await memberIdFor(pub) };
}

describe('encoding', () => {
  it('base64url round-trips every length', () => {
    for (let n = 0; n < 40; n++) {
      const b = randomBytes(n);
      expect([...fromB64u(b64u(b))]).toEqual([...b]);
    }
    expect(() => fromB64u('a+b/')).toThrow();
  });
  it('canonical JSON sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, undefined], c: undefined } })).toBe('{"a":{"d":[1,null]},"b":1}');
  });
});

describe('device keys', () => {
  it('private keys are not extractable and ids are stable hashes of public keys', async () => {
    const d = await device();
    expect(d.keys.ecdh.privateKey.extractable).toBe(false);
    expect(d.keys.ecdsa.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', d.keys.ecdsa.privateKey)).rejects.toThrow();
    expect(await memberIdFor(d.pub)).toBe(d.id);
    expect(d.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('envelopes', () => {
  it('round-trips, and fails on tamper, wrong recipient and wrong sender key', async () => {
    const alice = await device();
    const bob = await device();
    const eve = await device();
    const payload = { hello: 'world', n: [1, 2, 3] };
    const env = await sealEnvelope({ kind: 'summary', from: alice.id, to: bob.id, recipientEcdh: bob.pub.ecdh, senderSigningKey: alice.keys.ecdsa.privateKey, payload });
    const openAs = (who: typeof bob, e: Envelope, senderEcdsa = alice.pub.ecdsa) =>
      openEnvelope(e, { me: who.id, myEcdhPrivate: who.keys.ecdh.privateKey, senderEcdsa, expectKind: 'summary', expectFrom: alice.id });

    expect(await openAs(bob, env)).toEqual(payload);
    expect(env.ct).not.toContain('world');

    // Tampered ciphertext / header.
    const ct = fromB64u(env.ct); ct[0] ^= 1;
    await expect(openAs(bob, { ...env, ct: b64u(ct) })).rejects.toBeInstanceOf(EnvelopeError);
    await expect(openAs(bob, { ...env, createdAt: '2020-01-01T00:00:00.000Z' })).rejects.toThrow('Signature');
    await expect(openAs(bob, { ...env, kind: 'profile' })).rejects.toThrow();
    // Wrong recipient: Eve can't open it even if she rewrites `to` (signature breaks) …
    await expect(openAs(eve, env)).rejects.toThrow('someone else');
    await expect(openAs(eve, { ...env, to: eve.id })).rejects.toThrow('Signature');
    // … and an envelope Alice addressed to Bob but sealed to Eve's key won't decrypt for Bob.
    const misdirected = await sealEnvelope({ kind: 'summary', from: alice.id, to: bob.id, recipientEcdh: eve.pub.ecdh, senderSigningKey: alice.keys.ecdsa.privateKey, payload });
    await expect(openAs(bob, misdirected)).rejects.toThrow('decrypt');
    // Forged by Eve claiming to be Alice.
    const forged = await sealEnvelope({ kind: 'summary', from: alice.id, to: bob.id, recipientEcdh: bob.pub.ecdh, senderSigningKey: eve.keys.ecdsa.privateKey, payload });
    await expect(openAs(bob, forged)).rejects.toThrow('Signature');
  });
});

describe('signatures', () => {
  it('verifies signed requests and rejects changes', async () => {
    const d = await device();
    const h = await signRequest(d.keys.ecdsa.privateKey, d.id, 'PUT', '/api/household/shares/summary/x', '{"a":1}', 1_000);
    const bytes = await requestSigningBytes('PUT', '/api/household/shares/summary/x', h[HEADER.ts], h[HEADER.nonce], '{"a":1}');
    expect(await verifyBytes(d.pub.ecdsa, bytes, h[HEADER.sig])).toBe(true);
    const other = await requestSigningBytes('PUT', '/api/household/shares/summary/x', h[HEADER.ts], h[HEADER.nonce], '{"a":2}');
    expect(await verifyBytes(d.pub.ecdsa, other, h[HEADER.sig])).toBe(false);
    expect(await verifyBytes('garbage', bytes, h[HEADER.sig])).toBe(false);
    expect(await verifyBytes(d.pub.ecdsa, utf8('x'), await signBytes(d.keys.ecdsa.privateKey, utf8('x')))).toBe(true);
  });

  it('admissions bind household, member and keys to the owner', async () => {
    const owner = await device();
    const m = await device();
    const sig = await signAdmission(owner.keys.ecdsa.privateKey, 'house1234567890ab', m.id, m.pub);
    expect(await verifyAdmission(owner.pub.ecdsa, 'house1234567890ab', m.id, m.pub, sig)).toBe(true);
    expect(await verifyAdmission(owner.pub.ecdsa, 'otherhouse123456', m.id, m.pub, sig)).toBe(false);
    expect(await verifyAdmission(m.pub.ecdsa, 'house1234567890ab', m.id, m.pub, sig)).toBe(false);
    expect(admissionBytes('h', 'm', m.pub).length).toBeGreaterThan(100);
  });
});

describe('invites', () => {
  it('welcome and join proof need the token', async () => {
    const token = newToken();
    const hash = await inviteTokenHash(token);
    expect(hash).not.toBe(token);
    const sealed = await sealWelcome(token, { householdName: 'Home' });
    expect(sealed).not.toContain('Home');
    expect(await openWelcome(token, sealed)).toEqual({ householdName: 'Home' });
    await expect(openWelcome(newToken(), sealed)).rejects.toThrow();
    const m = await device();
    const proof = await joinProof(token, hash, m.id, m.pub);
    expect(await verifyJoinProof(token, hash, m.id, m.pub, proof)).toBe(true);
    expect(await verifyJoinProof(newToken(), hash, m.id, m.pub, proof)).toBe(false);
  });

  it('parses links, fragments and rejects junk', () => {
    const token = newToken();
    const owner = b64u(randomBytes(32));
    const frag = formatInviteFragment(token, owner);
    expect(parseInviteFragment(`https://drift.example/join#${frag}`)).toEqual({ token, ownerId: owner });
    expect(parseInviteFragment(`#${frag}`)).toEqual({ token, ownerId: owner });
    expect(parseInviteFragment(frag)).toEqual({ token, ownerId: owner });
    expect(parseInviteFragment('nope')).toBeNull();
    expect(parseInviteFragment(`${frag}.extra`)).toBeNull();
  });
});
