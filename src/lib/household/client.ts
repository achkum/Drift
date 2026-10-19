// OWNER: household agent. The household client: identity, invites, sharing,
// alerts and the question log. Everything sensitive is encrypted on this
// device before it touches the network. See docs/HOUSEHOLD.md.
import type { Insights } from '@/lib/types';
import {
  exportPublicKeys, generateDeviceKeys, inviteTokenHash, isValidPublicKey, joinProof, memberIdFor, newToken, openEnvelope, openWelcome,
  sealEnvelope, sealWelcome, shortFingerprint, signAdmission, signRequest, verifyAdmission, verifyJoinProof,
  type DeviceKeys, type Envelope, type EnvelopeKind,
} from './crypto';
import { canonicalJson, sha256b64u } from './encoding';
import { INVITE_TTL_MS, formatInviteFragment, inviteUrl, parseInviteFragment } from './invite';
import { isIndexedDbAvailable, openLocalDb, HOUSEHOLD_DB_NAME, type LocalDb } from './localdb';
import { detectSafetyAlerts, mergeAlerts } from './safety';
import { ALERT_SHARE_DELAY_MS, buildSharedSummary, categoriesFromSettings } from './summary';
import type {
  CreatedInvite, HouseholdMember, HouseholdRole, InviteRole, Me, MemberStatus, PublicKeys, QuestionNote,
  ReceivedSummary, SafetyAlert, SafetyAlertView, ShareCategory, ShareSettings, SharedSummary,
} from './types';
import { SHARE_CATEGORIES } from './types';

export class HouseholdError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'HouseholdError';
  }
}

export interface HouseholdClientOptions {
  /** IndexedDB database name. Default 'drift-household'. */
  dbName?: string;
  /** Mailbox base URL. Default '/api/household'. */
  baseUrl?: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
  /** Where publish/preview get Insights when not passed in. Default: the history store's latest Insights. */
  getInsights?: () => Promise<Insights | null>;
  /** Origin for invite links. Default: window.location.origin. */
  origin?: string;
  /** Delay before a safety alert can reach anyone else. Default 48 h. */
  alertDelayMs?: number;
}

// ── Local records ──
interface Identity { keys: DeviceKeys; pub: PublicKeys; memberId: string; createdAt: string }
interface Profile { displayName: string; role: HouseholdRole | null }
interface LocalHousehold { id: string; name: string; ownerId: string; ownerKeys: PublicKeys; isOwner: boolean; joinedAt: string }
interface LocalInvite { tokenHash: string; token: string; role: InviteRole; label?: string; expiresAt: string; createdAt: string }
interface CachedProfile { displayName: string; role: HouseholdRole | null; sharedAt: string }
interface Welcome { v: 1; householdId: string; householdName: string; ownerId: string; ownerName: string; ownerKeys: PublicKeys; role: InviteRole; expiresAt: string }
interface QuestionPayload { question: string; categories: ShareCategory[]; askedAt: string; askerName: string }

interface VerifiedMember {
  memberId: string;
  keys: PublicKeys;
  joinedAt: string;
  isOwner: boolean;
  status: Exclude<MemberStatus, 'invited'>;
}

export const MAX_QUESTION_LENGTH = 500;

export function defaultShareSettings(): ShareSettings {
  return { trends: false, sources: false, ads: false, questions: false, sensitive: false, alerts: false, updatedAt: '' };
}

const sameKeys = (a: PublicKeys, b: PublicKeys) => a.ecdh === b.ecdh && a.ecdsa === b.ecdsa;

export function createHouseholdClient(opts: HouseholdClientOptions = {}) {
  const baseUrl = (opts.baseUrl ?? '/api/household').replace(/\/$/, '');
  const now = opts.now ?? (() => new Date());
  const alertDelayMs = opts.alertDelayMs ?? ALERT_SHARE_DELAY_MS;
  const doFetch = opts.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));
  const getInsights = opts.getInsights ?? (async () => {
    try { return await (await import('@/lib/store')).loadInsights(); } catch { return null; }
  });
  let dbInstance: LocalDb | null = null;
  const db = () => {
    if (!isIndexedDbAvailable()) throw new HouseholdError('unavailable', 'Household mode needs browser storage, which is not available here.');
    return (dbInstance ??= openLocalDb(opts.dbName ?? HOUSEHOLD_DB_NAME));
  };

  // ── identity ──
  let identityPromise: Promise<Identity> | null = null;
  function identity(): Promise<Identity> {
    if (!identityPromise) {
      identityPromise = (async () => {
        const existing = await db().get<Identity>('kv', 'identity');
        if (existing) return existing;
        const keys = await generateDeviceKeys();
        const pub = await exportPublicKeys(keys);
        const id: Identity = { keys, pub, memberId: await memberIdFor(pub), createdAt: now().toISOString() };
        await db().put('kv', 'identity', id);
        return id;
      })();
      identityPromise.catch(() => { identityPromise = null; });
    }
    return identityPromise;
  }
  const getProfile = async (): Promise<Profile> => (await db().get<Profile>('kv', 'profile')) ?? { displayName: '', role: null };
  const getHousehold = async () => (await db().get<LocalHousehold>('kv', 'household')) ?? null;
  async function requireHousehold(): Promise<LocalHousehold> {
    const h = await getHousehold();
    if (!h) throw new HouseholdError('no_household', 'You are not in a household yet.');
    return h;
  }

  // ── transport ──
  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const id = await identity();
    const url = `${baseUrl}${path}`;
    const u = new URL(url, 'http://localhost');
    const text = body === undefined ? '' : JSON.stringify(body);
    const headers = await signRequest(id.keys.ecdsa.privateKey, id.memberId, method, u.pathname + u.search, text, now().getTime());
    let res: Response;
    try {
      res = await doFetch(url, { method, headers: { ...headers, ...(text ? { 'content-type': 'application/json' } : {}) }, body: text || undefined });
    } catch {
      throw new HouseholdError('offline', 'Could not reach Drift. Check your connection.');
    }
    const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    if (!res.ok) throw new HouseholdError(data.error?.code ?? 'http_error', data.error?.message ?? `Request failed (${res.status}).`, res.status);
    return data as T;
  }

  async function seal(kind: EnvelopeKind, to: VerifiedMember, payload: unknown): Promise<Envelope> {
    const id = await identity();
    return sealEnvelope({ kind, from: id.memberId, to: to.memberId, recipientEcdh: to.keys.ecdh, senderSigningKey: id.keys.ecdsa.privateKey, payload, now: now() });
  }

  async function open<T>(env: Envelope, from: VerifiedMember, kind: EnvelopeKind): Promise<T> {
    const id = await identity();
    return openEnvelope<T>(env, { me: id.memberId, myEcdhPrivate: id.keys.ecdh.privateKey, senderEcdsa: from.keys.ecdsa, expectKind: kind, expectFrom: from.memberId });
  }

  // ── membership verification ──
  /**
   * Members whose keys this device can trust: the owner pinned at join time
   * (or ourselves as owner), and members carrying a valid owner admission.
   * As owner, confirms pending joins whose proof matches an invite made here.
   */
  async function verifiedMembers(): Promise<{ household: LocalHousehold; members: VerifiedMember[] }> {
    const household = await requireHousehold();
    const id = await identity();
    const res = await api<{ householdId: string; ownerId: string; members: { memberId: string; ecdh: string; ecdsa: string; joinedAt: string; isOwner: boolean; admission: string | null; inviteHash?: string | null; joinProof?: string | null }[] }>('GET', '/members');
    if (res.householdId !== household.id || res.ownerId !== household.ownerId) throw new HouseholdError('household_mismatch', 'The server returned a different household.');
    const out: VerifiedMember[] = [];
    for (const m of res.members) {
      const keys = { ecdh: m.ecdh, ecdsa: m.ecdsa };
      if (!isValidPublicKey(keys.ecdh) || !isValidPublicKey(keys.ecdsa) || (await memberIdFor(keys)) !== m.memberId) continue;
      if (m.memberId === household.ownerId) {
        if (!sameKeys(keys, household.ownerKeys)) continue; // server tried to swap owner keys
        out.push({ memberId: m.memberId, keys, joinedAt: m.joinedAt, isOwner: true, status: 'active' });
        continue;
      }
      if (m.admission && (await verifyAdmission(household.ownerKeys.ecdsa, household.id, m.memberId, keys, m.admission))) {
        out.push({ memberId: m.memberId, keys, joinedAt: m.joinedAt, isOwner: false, status: 'active' });
        continue;
      }
      if (household.isOwner && m.inviteHash && m.joinProof) {
        const inv = await db().get<LocalInvite>('invites', m.inviteHash);
        if (inv && (await verifyJoinProof(inv.token, inv.tokenHash, m.memberId, keys, m.joinProof))) {
          const admission = await signAdmission(id.keys.ecdsa.privateKey, household.id, m.memberId, keys);
          await api('POST', `/members/${encodeURIComponent(m.memberId)}/admit`, { admission });
          await db().put<CachedProfile>('profiles', m.memberId, { displayName: inv.label ?? 'New member', role: inv.role, sharedAt: '' });
          await db().del('invites', inv.tokenHash);
          out.push({ memberId: m.memberId, keys, joinedAt: m.joinedAt, isOwner: false, status: 'active' });
          continue;
        }
        if (inv) {
          // Proof does not match the invite this device made: not who we invited.
          await api('DELETE', `/members/${encodeURIComponent(m.memberId)}`).catch(() => undefined);
          continue;
        }
      }
      out.push({ memberId: m.memberId, keys, joinedAt: m.joinedAt, isOwner: false, status: 'pending' });
    }
    // Forget local data about people who are gone.
    const present = new Set(out.map((m) => m.memberId));
    for (const s of ['summaries', 'shareSettings', 'profiles'] as const) {
      for (const { key } of await db().all(s)) if (!present.has(key) && key !== id.memberId) await db().del(s, key);
    }
    return { household, members: out };
  }

  async function refreshProfiles(members: VerifiedMember[]): Promise<void> {
    const byId = new Map(members.filter((m) => m.status === 'active').map((m) => [m.memberId, m]));
    const res = await api<{ shares: { sender: string; envelope: Envelope }[] }>('GET', '/shares?kind=profile');
    for (const s of res.shares) {
      const from = byId.get(s.sender);
      if (!from) continue;
      try {
        const p = await open<{ displayName: string; role: HouseholdRole | null }>(s.envelope, from, 'profile');
        const prev = await db().get<CachedProfile>('profiles', from.memberId);
        if (prev?.sharedAt && prev.sharedAt > s.envelope.createdAt) continue;
        await db().put<CachedProfile>('profiles', from.memberId, {
          displayName: String(p.displayName ?? '').slice(0, 60) || 'Member',
          role: p.role === 'owner' || p.role === 'adult' || p.role === 'teen' ? p.role : null,
          sharedAt: s.envelope.createdAt,
        });
      } catch { /* tampered or not for us: ignore */ }
    }
  }

  async function publishProfile(to: VerifiedMember): Promise<void> {
    const me = await getProfile();
    const payload = { displayName: me.displayName, role: me.role };
    const hash = await sha256b64u(canonicalJson({ payload, to: to.keys }));
    const key = `profile:${to.memberId}`;
    const prev = await db().get<{ hash: string }>('published', key);
    if (prev?.hash === hash) return;
    await api('PUT', `/shares/profile/${encodeURIComponent(to.memberId)}`, { envelope: await seal('profile', to, payload) });
    await db().put('published', key, { hash, at: now().toISOString() });
  }

  // ── safety alerts ──
  async function refreshAlerts(insights: Insights | null): Promise<SafetyAlert[]> {
    const known = (await db().all<SafetyAlert>('alerts')).map((r) => r.value);
    if (!insights) return known;
    const merged = mergeAlerts(known, detectSafetyAlerts(insights, now()));
    for (const a of merged) await db().put('alerts', a.id, a);
    return merged;
  }

  async function settingsFor(memberId: string): Promise<ShareSettings> {
    return { ...defaultShareSettings(), ...((await db().get<ShareSettings>('shareSettings', memberId)) ?? {}) };
  }

  async function summaryFor(memberId: string, insights: Insights, alerts: SafetyAlert[]): Promise<SharedSummary | null> {
    const cats = categoriesFromSettings(await settingsFor(memberId));
    if (cats.length === 0) return null;
    return buildSharedSummary(insights, cats, { alerts, now: now(), alertDelayMs });
  }

  async function publishTo(member: VerifiedMember, insights: Insights | null, alerts: SafetyAlert[]): Promise<'published' | 'removed' | 'unchanged'> {
    const key = `summary:${member.memberId}`;
    const prev = await db().get<{ hash: string }>('published', key);
    const cats = categoriesFromSettings(await settingsFor(member.memberId));
    if (cats.length === 0 || !insights) {
      if (cats.length > 0 && !insights) return 'unchanged';
      if (!prev) return 'unchanged';
      await api('DELETE', `/shares/summary/${encodeURIComponent(member.memberId)}`);
      await db().del('published', key);
      return 'removed';
    }
    const summary = (await summaryFor(member.memberId, insights, alerts))!;
    const hash = await sha256b64u(canonicalJson({ summary, to: member.keys }));
    if (prev?.hash === hash) return 'unchanged';
    await api('PUT', `/shares/summary/${encodeURIComponent(member.memberId)}`, { envelope: await seal('summary', member, summary) });
    await db().put('published', key, { hash, at: now().toISOString() });
    return 'published';
  }

  async function clearHouseholdState(): Promise<void> {
    for (const s of ['shareSettings', 'summaries', 'profiles', 'invites', 'published', 'questions'] as const) await db().clear(s);
    await db().del('kv', 'household');
    const p = await getProfile();
    await db().put<Profile>('kv', 'profile', { ...p, role: null });
  }

  // ════════════════════════ public API ════════════════════════

  const client = {
    /** This device's identity and household, or null when storage is unavailable (SSR). Creates keys on first call. */
    async getMe(): Promise<Me | null> {
      if (!isIndexedDbAvailable()) return null;
      const id = await identity();
      const [p, h] = await Promise.all([getProfile(), getHousehold()]);
      return {
        memberId: id.memberId,
        fingerprint: shortFingerprint(id.memberId),
        displayName: p.displayName,
        role: h ? p.role : null,
        household: h ? { id: h.id, name: h.name, ownerId: h.ownerId, isOwner: h.isOwner, joinedAt: h.joinedAt } : null,
      };
    },

    /** Changes the name others see. Re-sent to members on the next publishSummaries(). */
    async setDisplayName(displayName: string): Promise<void> {
      const p = await getProfile();
      await db().put<Profile>('kv', 'profile', { ...p, displayName: displayName.trim().slice(0, 60) });
    },

    /** Creates a household with this device as owner. */
    async createHousehold(name: string, displayName?: string): Promise<Me> {
      if (await getHousehold()) throw new HouseholdError('already_member', 'You are already in a household. Leave it first.');
      const id = await identity();
      const res = await api<{ householdId: string }>('POST', '/households', { keys: id.pub });
      const p = await getProfile();
      await db().put<Profile>('kv', 'profile', { displayName: (displayName ?? p.displayName).trim().slice(0, 60), role: 'owner' });
      await db().put<LocalHousehold>('kv', 'household', {
        id: res.householdId, name: name.trim().slice(0, 60) || 'Household', ownerId: id.memberId, ownerKeys: id.pub, isOwner: true, joinedAt: now().toISOString(),
      });
      return (await client.getMe())!;
    },

    /** Owner only. A one-time invite valid for 7 days. Share `url` or show `qrPayload` as a QR code. */
    async createInvite(role: InviteRole, opt: { label?: string; origin?: string } = {}): Promise<CreatedInvite> {
      const h = await requireHousehold();
      if (!h.isOwner) throw new HouseholdError('owner_only', 'Only the household owner can invite.');
      if (role !== 'adult' && role !== 'teen') throw new HouseholdError('bad_role', 'Invite an adult or a teen.');
      const id = await identity();
      const p = await getProfile();
      const token = newToken();
      const tokenHash = await inviteTokenHash(token);
      const expiresAt = new Date(now().getTime() + INVITE_TTL_MS).toISOString();
      const welcome: Welcome = { v: 1, householdId: h.id, householdName: h.name, ownerId: id.memberId, ownerName: p.displayName, ownerKeys: id.pub, role, expiresAt };
      await api('POST', '/invites', { tokenHash, expiresAt, welcome: await sealWelcome(token, welcome) });
      const label = opt.label?.trim().slice(0, 60) || undefined;
      await db().put<LocalInvite>('invites', tokenHash, { tokenHash, token, role, label, expiresAt, createdAt: now().toISOString() });
      const fragment = formatInviteFragment(token, id.memberId);
      const origin = opt.origin ?? opts.origin ?? (typeof location !== 'undefined' ? location.origin : '');
      const url = inviteUrl(origin, fragment);
      return { id: tokenHash, role, expiresAt, fragment, url, qrPayload: url };
    },

    /** Owner only. Cancels an invite that has not been used. */
    async cancelInvite(inviteId: string): Promise<void> {
      await api('DELETE', `/invites/${encodeURIComponent(inviteId)}`);
      await db().del('invites', inviteId);
    },

    /**
     * Joins with an invite link or fragment. Verifies the owner's keys against the
     * fingerprint in the link and leaves again if anything does not match.
     * Teens must pass `consent: true` (they saw and accepted the consent screen).
     * `share` sets what this person shares with the inviter; everything else stays off.
     */
    async joinWithInvite(
      fragment: string, displayName: string, role: InviteRole,
      opt: { consent?: boolean; share?: Partial<Record<ShareCategory, boolean>> } = {},
    ): Promise<Me> {
      const parsed = parseInviteFragment(fragment);
      if (!parsed) throw new HouseholdError('bad_invite', 'This invite link is not valid.');
      if (role === 'teen' && opt.consent !== true) throw new HouseholdError('consent_required', 'A teen joins only after agreeing on the consent screen.');
      if (await getHousehold()) throw new HouseholdError('already_member', 'You are already in a household. Leave it first.');
      const id = await identity();
      const tokenHash = await inviteTokenHash(parsed.token);
      const proof = await joinProof(parsed.token, tokenHash, id.memberId, id.pub);
      const res = await api<{ householdId: string; welcome: string; owner: { memberId: string; ecdh: string; ecdsa: string } | null }>(
        'POST', '/invites/redeem', { tokenHash, keys: id.pub, joinProof: proof },
      );
      const bail = async (code: string, msg: string): Promise<never> => {
        await api('DELETE', '/members/me').catch(() => undefined);
        throw new HouseholdError(code, msg);
      };
      if (!res.owner) return bail('owner_mismatch', 'Could not confirm who sent this invite.');
      const ownerKeys = { ecdh: res.owner.ecdh, ecdsa: res.owner.ecdsa };
      if (res.owner.memberId !== parsed.ownerId || (await memberIdFor(ownerKeys)) !== parsed.ownerId) {
        return bail('owner_mismatch', 'Could not confirm who sent this invite.');
      }
      let welcome: Welcome;
      try { welcome = await openWelcome<Welcome>(parsed.token, res.welcome); } catch { return bail('owner_mismatch', 'Could not confirm who sent this invite.'); }
      if (welcome.householdId !== res.householdId || welcome.ownerId !== parsed.ownerId || !sameKeys(welcome.ownerKeys, ownerKeys)) {
        return bail('owner_mismatch', 'Could not confirm who sent this invite.');
      }
      if (welcome.role !== role) return bail('role_mismatch', `This invite is for ${welcome.role === 'teen' ? 'a teen' : 'an adult'}.`);

      await db().put<Profile>('kv', 'profile', { displayName: displayName.trim().slice(0, 60), role });
      await db().put<LocalHousehold>('kv', 'household', {
        id: res.householdId, name: welcome.householdName, ownerId: parsed.ownerId, ownerKeys, isOwner: false, joinedAt: now().toISOString(),
      });
      await db().put<CachedProfile>('profiles', parsed.ownerId, { displayName: welcome.ownerName || 'Owner', role: 'owner', sharedAt: '' });
      const share = { ...defaultShareSettings() };
      for (const c of SHARE_CATEGORIES) if (opt.share?.[c] === true) share[c] = true;
      if (opt.share) share.updatedAt = now().toISOString();
      await db().put('shareSettings', parsed.ownerId, share);
      const owner: VerifiedMember = { memberId: parsed.ownerId, keys: ownerKeys, joinedAt: '', isOwner: true, status: 'active' };
      await publishProfile(owner).catch(() => undefined);
      return (await client.getMe())!;
    },

    /** Everyone in the household plus (owner only) open invites. Confirms pending joins on the owner's device. */
    async listMembers(): Promise<HouseholdMember[]> {
      const id = await identity();
      const { members } = await verifiedMembers();
      await refreshProfiles(members).catch(() => undefined);
      const me = await getProfile();
      for (const m of members) if (m.status === 'active' && m.memberId !== id.memberId) await publishProfile(m).catch(() => undefined);
      const out: HouseholdMember[] = [];
      for (const m of members) {
        const isMe = m.memberId === id.memberId;
        const p = isMe ? null : await db().get<CachedProfile>('profiles', m.memberId);
        out.push({
          memberId: m.memberId,
          displayName: isMe ? me.displayName : p?.displayName ?? 'New member',
          role: isMe ? me.role : m.isOwner ? 'owner' : p?.role ?? null,
          status: m.status, isMe, isOwner: m.isOwner, joinedAt: m.joinedAt, fingerprint: shortFingerprint(m.memberId),
        });
      }
      const h = await requireHousehold();
      if (h.isOwner) {
        const t = now().toISOString();
        for (const { value: inv } of await db().all<LocalInvite>('invites')) {
          if (inv.expiresAt < t) { await db().del('invites', inv.tokenHash); continue; }
          out.push({
            memberId: `invite:${inv.tokenHash}`, displayName: inv.label ?? 'Invited', role: inv.role, status: 'invited',
            isMe: false, isOwner: false, invite: { id: inv.tokenHash, expiresAt: inv.expiresAt, role: inv.role },
          });
        }
      }
      return out;
    },

    /** What this device shares with one member. All off until changed. */
    getShareSettings: settingsFor,

    /**
     * Changes what this device shares with one member. Takes effect right away:
     * the member's server copy is replaced (or deleted when everything is off).
     */
    async setShareSettings(memberId: string, patch: Partial<Record<ShareCategory, boolean>>, insights?: Insights | null): Promise<ShareSettings> {
      const next = await settingsFor(memberId);
      for (const c of SHARE_CATEGORIES) if (typeof patch[c] === 'boolean') next[c] = patch[c]!;
      next.updatedAt = now().toISOString();
      await db().put('shareSettings', memberId, next);
      const h = await getHousehold();
      if (!h) return next;
      try {
        const { members } = await verifiedMembers();
        const m = members.find((x) => x.memberId === memberId && x.status === 'active');
        if (m) {
          const ins = insights === undefined ? await getInsights() : insights;
          const alerts = await refreshAlerts(ins);
          if (categoriesFromSettings(next).length > 0 && !ins) {
            // Nothing to rebuild from: withdraw the old copy so a revoke still takes effect.
            await api('DELETE', `/shares/summary/${encodeURIComponent(memberId)}`);
            await db().del('published', `summary:${memberId}`);
          } else {
            await publishTo(m, ins, alerts);
          }
        }
      } catch (e) {
        if (!(e instanceof HouseholdError && e.code === 'offline')) throw e;
      }
      return next;
    },

    /**
     * Rebuilds and uploads the encrypted summary for every member, per that
     * member's share settings. Call after new Insights, on app start and at
     * least daily (delayed safety alerts are released this way).
     */
    async publishSummaries(insights?: Insights | null): Promise<{ published: string[]; removed: string[]; unchanged: string[]; nextAlertReleaseAt: string | null }> {
      const id = await identity();
      const ins = insights === undefined ? await getInsights() : insights;
      const alerts = await refreshAlerts(ins);
      const { members } = await verifiedMembers();
      const r = { published: [] as string[], removed: [] as string[], unchanged: [] as string[] };
      for (const m of members) {
        if (m.memberId === id.memberId || m.status !== 'active') continue;
        await publishProfile(m);
        r[await publishTo(m, ins, alerts)].push(m.memberId);
      }
      const t = now().getTime();
      const pending = alerts.filter((a) => !a.dismissed).map((a) => Date.parse(a.detectedAt) + alertDelayMs).filter((x) => x > t).sort((a, b) => a - b);
      return { ...r, nextAlertReleaseAt: pending.length ? new Date(pending[0]).toISOString() : null };
    },

    /** Downloads, verifies and decrypts what others share with you. Falls back to the local cache offline. */
    async fetchMemberSummaries(): Promise<ReceivedSummary[]> {
      try {
        const { members } = await verifiedMembers();
        await refreshProfiles(members).catch(() => undefined);
        const byId = new Map(members.filter((m) => m.status === 'active').map((m) => [m.memberId, m]));
        const res = await api<{ shares: { sender: string; envelope: Envelope }[] }>('GET', '/shares?kind=summary');
        const seen = new Set<string>();
        for (const s of res.shares) {
          const from = byId.get(s.sender);
          if (!from) continue;
          try {
            const summary = await open<SharedSummary>(s.envelope, from, 'summary');
            if (!summary || summary.v !== 1 || !Array.isArray(summary.categories)) continue;
            const prev = await db().get<ReceivedSummary>('summaries', from.memberId);
            seen.add(from.memberId);
            if (prev && prev.sharedAt > s.envelope.createdAt) continue; // never roll back to an older copy
            const p = await db().get<CachedProfile>('profiles', from.memberId);
            await db().put<ReceivedSummary>('summaries', from.memberId, {
              memberId: from.memberId, displayName: p?.displayName ?? 'Member', role: from.isOwner ? 'owner' : p?.role ?? null,
              summary, sharedAt: s.envelope.createdAt, receivedAt: now().toISOString(),
            });
          } catch { /* tampered or not for us */ }
        }
        // A member who stopped sharing everything has no server copy: drop ours too.
        for (const { key } of await db().all('summaries')) if (!seen.has(key)) await db().del('summaries', key);
      } catch (e) {
        if (!(e instanceof HouseholdError && e.code === 'offline')) throw e;
      }
      return (await db().all<ReceivedSummary>('summaries')).map((r) => r.value);
    },

    /** Exactly what `memberId` would receive from you now (the same builder publish uses). */
    async previewWhatTheySee(memberId: string, insights?: Insights | null): Promise<SharedSummary | null> {
      const ins = insights === undefined ? await getInsights() : insights;
      if (!ins) return null;
      const alerts = (await db().all<SafetyAlert>('alerts')).map((r) => r.value);
      return summaryFor(memberId, ins, alerts);
    },

    /** Questions others asked Drift about you. Fetches new ones, stores them here, removes them from the server. */
    async listQuestionsAboutMe(): Promise<QuestionNote[]> {
      try {
        if (await getHousehold()) {
          const { members } = await verifiedMembers();
          const byId = new Map(members.filter((m) => m.status === 'active').map((m) => [m.memberId, m]));
          const res = await api<{ notes: { id: string; sender: string; storedAt: string; envelope: Envelope }[] }>('GET', '/notes');
          for (const n of res.notes) {
            const from = byId.get(n.sender);
            if (!from) continue; // not verifiable yet; keep it on the server
            try {
              const q = await open<QuestionPayload>(n.envelope, from, 'question');
              const p = await db().get<CachedProfile>('profiles', from.memberId);
              await db().put<QuestionNote>('questions', n.id, {
                id: n.id, askerId: from.memberId, askerName: p?.displayName ?? String(q.askerName ?? 'Member').slice(0, 60),
                question: String(q.question ?? '').slice(0, MAX_QUESTION_LENGTH),
                categories: (Array.isArray(q.categories) ? q.categories : []).filter((c): c is ShareCategory => SHARE_CATEGORIES.includes(c)),
                askedAt: n.envelope.createdAt,
              });
            } catch { /* tampered: drop */ }
            await api('DELETE', `/notes/${encodeURIComponent(n.id)}`).catch(() => undefined);
          }
        }
      } catch (e) {
        if (!(e instanceof HouseholdError && e.code === 'offline')) throw e;
      }
      return (await db().all<QuestionNote>('questions')).map((r) => r.value).sort((a, b) => b.askedAt.localeCompare(a.askedAt));
    },

    /**
     * Call before answering a question about another member. Fails when that
     * member has not turned on 'questions' for you. The member sees the
     * question and which categories the answer used.
     */
    async logQuestion(memberId: string, question: string, categories: ShareCategory[]): Promise<void> {
      const received = await db().get<ReceivedSummary>('summaries', memberId);
      if (!received?.summary.allowQuestions) throw new HouseholdError('questions_not_allowed', 'This person has not allowed questions about their data.');
      const q = question.trim();
      if (!q) throw new HouseholdError('empty_question', 'Ask a question first.');
      const { members } = await verifiedMembers();
      const to = members.find((m) => m.memberId === memberId && m.status === 'active');
      if (!to) throw new HouseholdError('no_member', 'This person is no longer in your household.');
      const allowed = new Set(received.summary.categories);
      const used = [...new Set(categories)].filter((c) => SHARE_CATEGORIES.includes(c) && allowed.has(c));
      const me = await getProfile();
      const payload: QuestionPayload = { question: q.slice(0, MAX_QUESTION_LENGTH), categories: used, askedAt: now().toISOString(), askerName: me.displayName };
      await api('POST', `/notes/${encodeURIComponent(memberId)}`, { envelope: await seal('question', to, payload) });
    },

    /**
     * Own alerts (shown to you at once) plus alerts others share with you
     * (released to you only after their delay). Pass Insights to re-check.
     */
    async getSafetyAlerts(insights?: Insights | null): Promise<SafetyAlertView[]> {
      const own = await refreshAlerts(insights ?? null);
      const me = await getProfile();
      const views: SafetyAlertView[] = own.filter((a) => !a.dismissed).map((a) => ({ ...a, about: 'me', aboutName: me.displayName, toldMemberAt: a.detectedAt }));
      for (const { value: r } of await db().all<ReceivedSummary>('summaries')) {
        for (const a of r.summary.alerts ?? []) {
          views.push({
            id: `${r.memberId}:${a.id}`, topic: a.topic, label: a.label, fromShare: a.fromShare, toShare: a.toShare,
            fromMonth: a.fromMonth, toMonth: a.toMonth, rise: Math.round((a.toShare - a.fromShare) * 10) / 10,
            detectedAt: a.toldMemberAt, message: a.message, about: r.memberId, aboutName: r.displayName, toldMemberAt: a.toldMemberAt,
          });
        }
      }
      return views;
    },

    /** "This doesn't look right": hides the alert and keeps it from ever being shared. */
    async dismissSafetyAlert(alertId: string): Promise<void> {
      const a = await db().get<SafetyAlert>('alerts', alertId);
      if (a) await db().put('alerts', alertId, { ...a, dismissed: true });
    },

    /** Owner only. Removes a member and deletes everything they sent or received on the server. */
    async removeMember(memberId: string): Promise<void> {
      const h = await requireHousehold();
      if (!h.isOwner) throw new HouseholdError('owner_only', 'Only the owner can remove members.');
      await api('DELETE', `/members/${encodeURIComponent(memberId)}`);
      for (const s of ['summaries', 'shareSettings', 'profiles'] as const) await db().del(s, memberId);
      await db().del('published', `summary:${memberId}`);
      await db().del('published', `profile:${memberId}`);
    },

    /** Leaves the household (the owner deletes it for everyone). Server copies are deleted; device keys are kept. */
    async leaveHousehold(): Promise<void> {
      const h = await requireHousehold();
      try {
        await api('DELETE', h.isOwner ? '/households/me' : '/members/me');
      } catch (e) {
        // Already gone on the server is fine; anything else must not silently leave data behind.
        if (!(e instanceof HouseholdError && (e.code === 'not_member' || e.code === 'household_gone'))) throw e;
      }
      await clearHouseholdState();
    },

    /**
     * Leaves the household if possible and deletes all household data on this
     * device, including the device keys. Returns whether the server copy was removed.
     */
    async deleteHouseholdData(): Promise<{ serverDeleted: boolean }> {
      if (!isIndexedDbAvailable()) return { serverDeleted: false };
      let serverDeleted = true;
      if (await getHousehold()) {
        try { await client.leaveHousehold(); } catch { serverDeleted = false; }
      }
      await db().destroy();
      dbInstance = null;
      identityPromise = null;
      return { serverDeleted };
    },
  };
  return client;
}

export type HouseholdClient = ReturnType<typeof createHouseholdClient>;
