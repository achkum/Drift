import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { pkceChallenge, safeEqual, seal, unseal } from './crypto';
import { getGoogleConfig, parseTokenKey } from './config';

const key = randomBytes(32);

describe('seal / unseal', () => {
  it('round-trips a value', () => {
    const v = { rt: '1//refresh-token', n: 3, list: ['a'] };
    const s = seal(key, 'drift_google', v);
    expect(s.startsWith('v1.')).toBe(true);
    expect(s).not.toContain('refresh-token');
    expect(unseal(key, 'drift_google', s)).toEqual(v);
  });

  it('uses a fresh IV each time', () => {
    expect(seal(key, 'p', 'x')).not.toBe(seal(key, 'p', 'x'));
  });

  it('rejects tampered ciphertext, IV and tag', () => {
    const s = seal(key, 'p', { a: 1 });
    const [v, iv, ct] = s.split('.');
    const flip = (b64: string, i: number) => {
      const buf = Buffer.from(b64, 'base64url');
      buf[i] ^= 1;
      return buf.toString('base64url');
    };
    expect(unseal(key, 'p', `${v}.${iv}.${flip(ct, 0)}`)).toBeUndefined();
    expect(unseal(key, 'p', `${v}.${iv}.${flip(ct, Buffer.from(ct, 'base64url').length - 1)}`)).toBeUndefined();
    expect(unseal(key, 'p', `${v}.${flip(iv, 0)}.${ct}`)).toBeUndefined();
    expect(unseal(key, 'p', `v2.${iv}.${ct}`)).toBeUndefined();
    expect(unseal(key, 'p', 'garbage')).toBeUndefined();
    expect(unseal(key, 'p', undefined)).toBeUndefined();
  });

  it('rejects another key or another purpose', () => {
    const s = seal(key, 'drift_google', { a: 1 });
    expect(unseal(randomBytes(32), 'drift_google', s)).toBeUndefined();
    expect(unseal(key, 'drift_google_oauth', s)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('PKCE S256 = base64url(sha256(verifier)), checked with Web Crypto', async () => {
    const verifier = 'dBjftJeZ4CVP-mJ92K9xpRQTvG8XVrGwg8TPs0n9cpE';
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const expected = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(pkceChallenge(verifier)).toBe(expected);
    expect(pkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('parses token keys', () => {
    expect(parseTokenKey('00'.repeat(32))?.length).toBe(32);
    expect(parseTokenKey(randomBytes(32).toString('base64'))?.length).toBe(32);
    expect(parseTokenKey(randomBytes(32).toString('base64url'))?.length).toBe(32);
    expect(parseTokenKey('too-short')).toBeUndefined();
    expect(parseTokenKey(randomBytes(16).toString('hex'))).toBeUndefined();
  });

  it('config: unconfigured without env, mock without credentials', () => {
    expect(getGoogleConfig({}).ok).toBe(false);
    expect(getGoogleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }).ok).toBe(false);
    expect(getGoogleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', DRIFT_TOKEN_KEY: 'short' }).ok).toBe(false);
    expect(getGoogleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', DRIFT_TOKEN_KEY: '11'.repeat(32) }).ok).toBe(true);
    const mock = getGoogleConfig({ DRIFT_GOOGLE_MOCK: '1' });
    expect(mock.ok && mock.config.mock).toBe(true);
  });
});
