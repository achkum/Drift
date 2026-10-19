// OWNER: household agent. WebCrypto primitives for household mode.
// Runs in browsers, Web Workers and Node (globalThis.crypto). No dependencies.
//
//   identity     ECDH P-256 (receive) + ECDSA P-256 (sign), private keys non-extractable
//   member id    SHA-256("drift-member-v1" | ecdhRaw | ecdsaRaw), base64url
//   envelopes    ephemeral ECDH → HKDF-SHA-256 → AES-256-GCM, header as AAD, signed by sender (ECDSA SHA-256)
//   requests     ECDSA over "DRIFT-REQ-v1\nMETHOD\npath\nts\nnonce\nsha256(body)"
//   invites      HKDF(token) → AES-GCM welcome key + HMAC join-proof key
import {
  b64u, canonicalJson, concatBytes, fromB64u, fromUtf8, randomBytes, sha256, sha256b64u, subtle, utf8, type Bytes,
} from './encoding';
import type { PublicKeys } from './types';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export interface DeviceKeys {
  ecdh: CryptoKeyPair;
  ecdsa: CryptoKeyPair;
}

/** New device identity. Private keys cannot be exported, even by Drift. */
export async function generateDeviceKeys(): Promise<DeviceKeys> {
  const [ecdh, ecdsa] = await Promise.all([
    subtle().generateKey(ECDH, false, ['deriveBits']) as Promise<CryptoKeyPair>,
    subtle().generateKey(ECDSA, false, ['sign', 'verify']) as Promise<CryptoKeyPair>,
  ]);
  return { ecdh, ecdsa };
}

export async function exportPublicKeys(keys: DeviceKeys): Promise<PublicKeys> {
  const [e, s] = await Promise.all([
    subtle().exportKey('raw', keys.ecdh.publicKey),
    subtle().exportKey('raw', keys.ecdsa.publicKey),
  ]);
  return { ecdh: b64u(e), ecdsa: b64u(s) };
}

/** Uncompressed P-256 point: 65 bytes starting with 0x04. */
export function isValidPublicKey(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length !== 87) return false;
  try {
    const b = fromB64u(raw);
    return b.length === 65 && b[0] === 4;
  } catch {
    return false;
  }
}

export async function memberIdFor(pub: PublicKeys): Promise<string> {
  return sha256b64u(concatBytes(utf8('drift-member-v1'), fromB64u(pub.ecdh), fromB64u(pub.ecdsa)));
}

/** Short form for people to compare on two screens: 12 chars in groups of 4. */
export function shortFingerprint(memberId: string): string {
  const s = memberId.replace(/[-_]/g, '').toUpperCase().slice(0, 12);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export function importEcdsaPublic(raw: string): Promise<CryptoKey> {
  return subtle().importKey('raw', fromB64u(raw), ECDSA, true, ['verify']);
}

export function importEcdhPublic(raw: string): Promise<CryptoKey> {
  return subtle().importKey('raw', fromB64u(raw), ECDH, true, []);
}

export async function signBytes(privateKey: CryptoKey, data: Bytes): Promise<string> {
  return b64u(await subtle().sign(SIGN, privateKey, data));
}

/** False for a bad key, bad encoding or bad signature. Never throws. */
export async function verifyBytes(publicRaw: string, data: Bytes, sig: string): Promise<boolean> {
  try {
    const key = await importEcdsaPublic(publicRaw);
    return await subtle().verify(SIGN, key, fromB64u(sig), data);
  } catch {
    return false;
  }
}

// ── Envelopes ───────────────────────────────────────────────────────

export type EnvelopeKind = 'summary' | 'profile' | 'question';

/** What the server stores. It cannot read `ct`. */
export interface Envelope {
  v: 1;
  kind: EnvelopeKind;
  from: string;
  to: string;
  createdAt: string;
  /** Sender's ephemeral ECDH public key for this envelope. */
  epk: string;
  salt: string;
  iv: string;
  ct: string;
  /** Sender's ECDSA signature over the canonical header + ct. */
  sig: string;
}

type EnvelopeHeader = Omit<Envelope, 'ct' | 'sig'>;

function header(e: EnvelopeHeader): EnvelopeHeader {
  return { v: e.v, kind: e.kind, from: e.from, to: e.to, createdAt: e.createdAt, epk: e.epk, salt: e.salt, iv: e.iv };
}

async function envelopeKey(shared: ArrayBuffer, salt: Bytes, h: EnvelopeHeader, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const info = utf8(`drift-household/v1/${h.kind}/${h.from}/${h.to}`);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, ikm, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

export interface SealInput {
  kind: EnvelopeKind;
  from: string;
  to: string;
  recipientEcdh: string;
  senderSigningKey: CryptoKey;
  payload: unknown;
  now?: Date;
}

/** Encrypts `payload` for one recipient and signs it as the sender. */
export async function sealEnvelope(input: SealInput): Promise<Envelope> {
  const eph = (await subtle().generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair;
  const recipient = await importEcdhPublic(input.recipientEcdh);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: recipient }, eph.privateKey, 256);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const h: EnvelopeHeader = {
    v: 1, kind: input.kind, from: input.from, to: input.to,
    createdAt: (input.now ?? new Date()).toISOString(),
    epk: b64u(await subtle().exportKey('raw', eph.publicKey)),
    salt: b64u(salt), iv: b64u(iv),
  };
  const key = await envelopeKey(shared, salt, h, 'encrypt');
  const ct = b64u(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(canonicalJson(h)) }, key, utf8(canonicalJson(input.payload))));
  const sig = await signBytes(input.senderSigningKey, utf8(canonicalJson({ ...h, ct })));
  return { ...h, ct, sig };
}

export interface OpenInput {
  me: string;
  myEcdhPrivate: CryptoKey;
  /** The sender's ECDSA public key as pinned / admitted on this device. */
  senderEcdsa: string;
  expectKind: EnvelopeKind;
  expectFrom: string;
}

export class EnvelopeError extends Error {
  constructor(message: string) { super(message); this.name = 'EnvelopeError'; }
}

/** Verifies and decrypts. Throws EnvelopeError for anything wrong (tampered, wrong recipient, wrong sender). */
export async function openEnvelope<T = unknown>(env: Envelope, input: OpenInput): Promise<T> {
  if (!env || env.v !== 1) throw new EnvelopeError('Unknown envelope version');
  if (env.to !== input.me) throw new EnvelopeError('Envelope is for someone else');
  if (env.from !== input.expectFrom) throw new EnvelopeError('Envelope sender does not match');
  if (env.kind !== input.expectKind) throw new EnvelopeError('Unexpected envelope kind');
  const h = header(env);
  const ok = await verifyBytes(input.senderEcdsa, utf8(canonicalJson({ ...h, ct: env.ct })), env.sig);
  if (!ok) throw new EnvelopeError('Signature check failed');
  try {
    const eph = await importEcdhPublic(env.epk);
    const shared = await subtle().deriveBits({ name: 'ECDH', public: eph }, input.myEcdhPrivate, 256);
    const key = await envelopeKey(shared, fromB64u(env.salt), h, 'decrypt');
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(env.iv), additionalData: utf8(canonicalJson(h)) }, key, fromB64u(env.ct));
    return JSON.parse(fromUtf8(new Uint8Array(pt))) as T;
  } catch {
    throw new EnvelopeError('Could not decrypt');
  }
}

export function isEnvelope(v: unknown): v is Envelope {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return e.v === 1 && ['summary', 'profile', 'question'].includes(e.kind as string) &&
    ['from', 'to', 'createdAt', 'epk', 'salt', 'iv', 'ct', 'sig'].every((k) => typeof e[k] === 'string');
}

// ── Signed requests ─────────────────────────────────────────────────

export const REQUEST_MAX_SKEW_MS = 5 * 60 * 1000;

export const HEADER = {
  member: 'x-drift-member',
  ts: 'x-drift-ts',
  nonce: 'x-drift-nonce',
  sig: 'x-drift-sig',
} as const;

export async function requestSigningBytes(method: string, path: string, ts: string, nonce: string, body: string): Promise<Bytes> {
  return utf8(['DRIFT-REQ-v1', method.toUpperCase(), path, ts, nonce, await sha256b64u(body)].join('\n'));
}

export async function signRequest(
  signingKey: CryptoKey, memberId: string, method: string, path: string, body: string, now = Date.now(),
): Promise<Record<string, string>> {
  const ts = String(now);
  const nonce = b64u(randomBytes(16));
  const sig = await signBytes(signingKey, await requestSigningBytes(method, path, ts, nonce, body));
  return { [HEADER.member]: memberId, [HEADER.ts]: ts, [HEADER.nonce]: nonce, [HEADER.sig]: sig };
}

// ── Invites and admissions ──────────────────────────────────────────

export async function inviteTokenHash(token: string): Promise<string> {
  return sha256b64u(concatBytes(utf8('drift-invite-v1'), fromB64u(token)));
}

async function inviteKey(token: string, info: string): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', fromB64u(token), 'HKDF', false, ['deriveKey', 'deriveBits']);
  if (info === 'proof') {
    return subtle().deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8('drift-invite-v1/proof') },
      ikm, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'],
    );
  }
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8('drift-invite-v1/welcome') },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Encrypts the invite's welcome (household name, owner keys, role) with a key only invite holders have. */
export async function sealWelcome(token: string, payload: unknown): Promise<string> {
  const key = await inviteKey(token, 'welcome');
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8('drift-welcome') }, key, utf8(canonicalJson(payload)));
  return `${b64u(iv)}.${b64u(ct)}`;
}

export async function openWelcome<T>(token: string, sealed: string): Promise<T> {
  const [iv, ct] = sealed.split('.');
  const key = await inviteKey(token, 'welcome');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: utf8('drift-welcome') }, key, fromB64u(ct));
  return JSON.parse(fromUtf8(new Uint8Array(pt))) as T;
}

function proofBytes(householdId: string, memberId: string, keys: PublicKeys): Bytes {
  return utf8(canonicalJson({ t: 'drift-join-proof-v1', h: householdId, m: memberId, e: keys.ecdh, s: keys.ecdsa }));
}

/** Joiner proves to the owner (not the server) that it holds the invite token. */
export async function joinProof(token: string, householdId: string, memberId: string, keys: PublicKeys): Promise<string> {
  return b64u(await subtle().sign('HMAC', await inviteKey(token, 'proof'), proofBytes(householdId, memberId, keys)));
}

export async function verifyJoinProof(token: string, householdId: string, memberId: string, keys: PublicKeys, proof: string): Promise<boolean> {
  try {
    return await subtle().verify('HMAC', await inviteKey(token, 'proof'), fromB64u(proof), proofBytes(householdId, memberId, keys));
  } catch {
    return false;
  }
}

export function admissionBytes(householdId: string, memberId: string, keys: PublicKeys): Bytes {
  return utf8(canonicalJson({ t: 'drift-admission-v1', h: householdId, m: memberId, e: keys.ecdh, s: keys.ecdsa }));
}

/** Owner's signature that a member's keys belong to the household. Other members trust only admitted keys. */
export async function signAdmission(ownerSigningKey: CryptoKey, householdId: string, memberId: string, keys: PublicKeys): Promise<string> {
  return signBytes(ownerSigningKey, admissionBytes(householdId, memberId, keys));
}

export async function verifyAdmission(ownerEcdsa: string, householdId: string, memberId: string, keys: PublicKeys, sig: string): Promise<boolean> {
  if ((await memberIdFor(keys)) !== memberId) return false;
  return verifyBytes(ownerEcdsa, admissionBytes(householdId, memberId, keys), sig);
}

export function newToken(): string {
  return b64u(randomBytes(32));
}

export { sha256 };
