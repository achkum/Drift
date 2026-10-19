// OWNER: household agent. Storage behind the household mailbox. Server-only.
//
// The store holds only: public keys, membership, invite token hashes with an
// encrypted welcome, and encrypted envelopes with sender/recipient ids and
// times. It never holds names, roles, share settings or plaintext summaries.

export interface HouseholdRow {
  id: string;
  ownerId: string;
  createdAt: string;
}

export interface MemberRow {
  householdId: string;
  memberId: string;
  ecdh: string;
  ecdsa: string;
  joinedAt: string;
  isOwner: boolean;
  /** Hash of the invite this member redeemed (null for the owner). */
  inviteHash: string | null;
  /** HMAC from the invite token; only the owner's device can check it. */
  joinProof: string | null;
  /** Owner's signature over the member's keys, once the owner's device confirmed the join. */
  admission: string | null;
}

export interface InviteRow {
  tokenHash: string;
  householdId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  /** AES-GCM sealed with a key derived from the token. Opaque to the server. */
  welcome: string;
  redeemedBy: string | null;
}

/** Latest summary / profile from sender to recipient (one per kind). */
export interface ShareRow {
  householdId: string;
  sender: string;
  recipient: string;
  kind: 'summary' | 'profile';
  body: string;
  createdAt: string;
}

/** Append-only question notes, deleted when the recipient acknowledges them. */
export interface NoteRow {
  id: string;
  householdId: string;
  sender: string;
  recipient: string;
  body: string;
  createdAt: string;
}

export interface HouseholdStore {
  createHousehold(h: HouseholdRow, owner: MemberRow): Promise<void>;
  getHousehold(id: string): Promise<HouseholdRow | null>;
  /** Deletes the household and everything in it. */
  deleteHousehold(id: string): Promise<void>;

  getMember(memberId: string): Promise<MemberRow | null>;
  listMembers(householdId: string): Promise<MemberRow[]>;
  addMember(m: MemberRow): Promise<void>;
  setAdmission(memberId: string, admission: string): Promise<void>;
  /** Removes the member and every share/note from or to them. */
  removeMember(memberId: string): Promise<void>;

  putInvite(i: InviteRow): Promise<void>;
  getInvite(tokenHash: string): Promise<InviteRow | null>;
  listInvites(householdId: string): Promise<InviteRow[]>;
  redeemInvite(tokenHash: string, memberId: string): Promise<boolean>;
  deleteInvite(tokenHash: string): Promise<void>;

  putShare(s: ShareRow): Promise<void>;
  listShares(recipient: string, kind?: ShareRow['kind']): Promise<ShareRow[]>;
  deleteShare(sender: string, recipient: string, kind: ShareRow['kind']): Promise<boolean>;

  addNote(n: NoteRow): Promise<void>;
  listNotes(recipient: string): Promise<NoteRow[]>;
  deleteNote(id: string, recipient: string): Promise<boolean>;

  /** Drops expired unredeemed invites and notes older than `notesBefore`. */
  prune(nowIso: string, notesBefore: string): Promise<void>;
  close(): Promise<void>;
}

/** In-memory store for tests and local dev without a data dir. */
export function createMemoryStore(): HouseholdStore {
  const households = new Map<string, HouseholdRow>();
  const members = new Map<string, MemberRow>();
  const invites = new Map<string, InviteRow>();
  const shares = new Map<string, ShareRow>();
  const notes = new Map<string, NoteRow>();
  const shareKey = (s: string, r: string, k: string) => `${s}|${r}|${k}`;
  const clone = <T>(v: T): T => structuredClone(v);

  const dropMemberData = (memberId: string) => {
    for (const [k, s] of shares) if (s.sender === memberId || s.recipient === memberId) shares.delete(k);
    for (const [k, n] of notes) if (n.sender === memberId || n.recipient === memberId) notes.delete(k);
  };

  return {
    async createHousehold(h, owner) {
      if (households.has(h.id) || members.has(owner.memberId)) throw new Error('exists');
      households.set(h.id, clone(h));
      members.set(owner.memberId, clone(owner));
    },
    async getHousehold(id) { return clone(households.get(id) ?? null); },
    async deleteHousehold(id) {
      households.delete(id);
      for (const [k, m] of members) if (m.householdId === id) { dropMemberData(m.memberId); members.delete(k); }
      for (const [k, i] of invites) if (i.householdId === id) invites.delete(k);
    },
    async getMember(id) { return clone(members.get(id) ?? null); },
    async listMembers(hid) { return [...members.values()].filter((m) => m.householdId === hid).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt)).map(clone); },
    async addMember(m) {
      if (members.has(m.memberId)) throw new Error('exists');
      members.set(m.memberId, clone(m));
    },
    async setAdmission(id, admission) { const m = members.get(id); if (m) m.admission = admission; },
    async removeMember(id) { members.delete(id); dropMemberData(id); },
    async putInvite(i) { invites.set(i.tokenHash, clone(i)); },
    async getInvite(h) { return clone(invites.get(h) ?? null); },
    async listInvites(hid) { return [...invites.values()].filter((i) => i.householdId === hid).map(clone); },
    async redeemInvite(h, memberId) {
      const i = invites.get(h);
      if (!i || i.redeemedBy) return false;
      i.redeemedBy = memberId;
      return true;
    },
    async deleteInvite(h) { invites.delete(h); },
    async putShare(s) { shares.set(shareKey(s.sender, s.recipient, s.kind), clone(s)); },
    async listShares(r, kind) { return [...shares.values()].filter((s) => s.recipient === r && (!kind || s.kind === kind)).map(clone); },
    async deleteShare(s, r, k) { return shares.delete(shareKey(s, r, k)); },
    async addNote(n) { notes.set(n.id, clone(n)); },
    async listNotes(r) { return [...notes.values()].filter((n) => n.recipient === r).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone); },
    async deleteNote(id, r) { const n = notes.get(id); if (!n || n.recipient !== r) return false; notes.delete(id); return true; },
    async prune(now, notesBefore) {
      for (const [k, i] of invites) if (!i.redeemedBy && i.expiresAt < now) invites.delete(k);
      for (const [k, n] of notes) if (n.createdAt < notesBefore) notes.delete(k);
    },
    async close() {},
  };
}
