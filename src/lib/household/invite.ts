// OWNER: household agent. Invite link format. Secrets live in the URL fragment,
// which browsers never send to the server.
//
//   /join#<token>.<ownerMemberId>
//   token          32 random bytes, base64url (43 chars). The server only sees a hash of it.
//   ownerMemberId  SHA-256 of the owner's public keys (43 chars). The joiner checks the
//                  owner keys it receives against it, so the server cannot swap them.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const JOIN_PATH = '/join';

const PART = /^[A-Za-z0-9_-]{43}$/;

export function formatInviteFragment(token: string, ownerId: string): string {
  return `${token}.${ownerId}`;
}

export function inviteUrl(origin: string, fragment: string): string {
  return `${origin.replace(/\/$/, '')}${JOIN_PATH}#${fragment}`;
}

/** Accepts the full link, "#fragment" or the bare fragment. Returns null when malformed. */
export function parseInviteFragment(input: string): { token: string; ownerId: string } | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(hash + 1);
  const [token, ownerId, ...rest] = s.split('.');
  if (rest.length || !token || !ownerId || !PART.test(token) || !PART.test(ownerId)) return null;
  return { token, ownerId };
}
