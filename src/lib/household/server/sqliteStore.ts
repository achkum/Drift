// OWNER: household agent. SQLite store using Node's built-in node:sqlite (Node ≥ 22.13, no native deps).
// Server-only. The file lives in DRIFT_DATA_DIR (default `.data/`, which must stay git-ignored).
import type { HouseholdStore, InviteRow, MemberRow, NoteRow, ShareRow } from './store';

type Row = Record<string, unknown>;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  member_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ecdh TEXT NOT NULL, ecdsa TEXT NOT NULL, joined_at TEXT NOT NULL, is_owner INTEGER NOT NULL,
  invite_hash TEXT, join_proof TEXT, admission TEXT
);
CREATE INDEX IF NOT EXISTS members_household ON members(household_id);
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  welcome TEXT NOT NULL, redeemed_by TEXT
);
CREATE TABLE IF NOT EXISTS shares (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, recipient TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (sender, recipient, kind)
);
CREATE INDEX IF NOT EXISTS shares_recipient ON shares(recipient);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, recipient TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_recipient ON notes(recipient);
`;

const member = (r: Row): MemberRow => ({
  householdId: String(r.household_id), memberId: String(r.member_id), ecdh: String(r.ecdh), ecdsa: String(r.ecdsa),
  joinedAt: String(r.joined_at), isOwner: Number(r.is_owner) === 1,
  inviteHash: (r.invite_hash as string | null) ?? null, joinProof: (r.join_proof as string | null) ?? null,
  admission: (r.admission as string | null) ?? null,
});
const invite = (r: Row): InviteRow => ({
  tokenHash: String(r.token_hash), householdId: String(r.household_id), createdBy: String(r.created_by),
  createdAt: String(r.created_at), expiresAt: String(r.expires_at), welcome: String(r.welcome),
  redeemedBy: (r.redeemed_by as string | null) ?? null,
});
const share = (r: Row): ShareRow => ({
  householdId: String(r.household_id), sender: String(r.sender), recipient: String(r.recipient),
  kind: r.kind as ShareRow['kind'], body: String(r.body), createdAt: String(r.created_at),
});
const note = (r: Row): NoteRow => ({
  id: String(r.id), householdId: String(r.household_id), sender: String(r.sender), recipient: String(r.recipient),
  body: String(r.body), createdAt: String(r.created_at),
});

/** `file` may be ':memory:'. */
export async function createSqliteStore(file: string): Promise<HouseholdStore> {
  // Loaded at runtime so bundlers and the browser build never see node:sqlite.
  const { DatabaseSync } = (await import(/* webpackIgnore: true */ 'node:sqlite')) as typeof import('node:sqlite');
  if (file !== ':memory:') {
    const [{ mkdirSync }, { dirname }] = await Promise.all([import('node:fs'), import('node:path')]);
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const q = (sql: string) => db.prepare(sql);

  const tx = (fn: () => void) => {
    db.exec('BEGIN');
    try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const insertMember = (m: MemberRow) => q(
    'INSERT INTO members (member_id, household_id, ecdh, ecdsa, joined_at, is_owner, invite_hash, join_proof, admission) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(m.memberId, m.householdId, m.ecdh, m.ecdsa, m.joinedAt, m.isOwner ? 1 : 0, m.inviteHash, m.joinProof, m.admission);

  return {
    async createHousehold(h, owner) {
      tx(() => {
        q('INSERT INTO households (id, owner_id, created_at) VALUES (?,?,?)').run(h.id, h.ownerId, h.createdAt);
        insertMember(owner);
      });
    },
    async getHousehold(id) {
      const r = q('SELECT * FROM households WHERE id = ?').get(id) as Row | undefined;
      return r ? { id: String(r.id), ownerId: String(r.owner_id), createdAt: String(r.created_at) } : null;
    },
    async deleteHousehold(id) { q('DELETE FROM households WHERE id = ?').run(id); },
    async getMember(id) {
      const r = q('SELECT * FROM members WHERE member_id = ?').get(id) as Row | undefined;
      return r ? member(r) : null;
    },
    async listMembers(hid) { return (q('SELECT * FROM members WHERE household_id = ? ORDER BY joined_at').all(hid) as Row[]).map(member); },
    async addMember(m) { insertMember(m); },
    async setAdmission(id, a) { q('UPDATE members SET admission = ? WHERE member_id = ?').run(a, id); },
    async removeMember(id) {
      tx(() => {
        q('DELETE FROM shares WHERE sender = ? OR recipient = ?').run(id, id);
        q('DELETE FROM notes WHERE sender = ? OR recipient = ?').run(id, id);
        q('DELETE FROM members WHERE member_id = ?').run(id);
      });
    },
    async putInvite(i) {
      q('INSERT OR REPLACE INTO invites (token_hash, household_id, created_by, created_at, expires_at, welcome, redeemed_by) VALUES (?,?,?,?,?,?,?)')
        .run(i.tokenHash, i.householdId, i.createdBy, i.createdAt, i.expiresAt, i.welcome, i.redeemedBy);
    },
    async getInvite(h) {
      const r = q('SELECT * FROM invites WHERE token_hash = ?').get(h) as Row | undefined;
      return r ? invite(r) : null;
    },
    async listInvites(hid) { return (q('SELECT * FROM invites WHERE household_id = ?').all(hid) as Row[]).map(invite); },
    async redeemInvite(h, memberId) {
      return Number(q('UPDATE invites SET redeemed_by = ? WHERE token_hash = ? AND redeemed_by IS NULL').run(memberId, h).changes) === 1;
    },
    async deleteInvite(h) { q('DELETE FROM invites WHERE token_hash = ?').run(h); },
    async putShare(s) {
      q('INSERT OR REPLACE INTO shares (household_id, sender, recipient, kind, body, created_at) VALUES (?,?,?,?,?,?)')
        .run(s.householdId, s.sender, s.recipient, s.kind, s.body, s.createdAt);
    },
    async listShares(r, kind) {
      const rows = kind
        ? q('SELECT * FROM shares WHERE recipient = ? AND kind = ?').all(r, kind)
        : q('SELECT * FROM shares WHERE recipient = ?').all(r);
      return (rows as Row[]).map(share);
    },
    async deleteShare(s, r, k) {
      return Number(q('DELETE FROM shares WHERE sender = ? AND recipient = ? AND kind = ?').run(s, r, k).changes) > 0;
    },
    async addNote(n) {
      q('INSERT INTO notes (id, household_id, sender, recipient, body, created_at) VALUES (?,?,?,?,?,?)')
        .run(n.id, n.householdId, n.sender, n.recipient, n.body, n.createdAt);
    },
    async listNotes(r) { return (q('SELECT * FROM notes WHERE recipient = ? ORDER BY created_at').all(r) as Row[]).map(note); },
    async deleteNote(id, r) { return Number(q('DELETE FROM notes WHERE id = ? AND recipient = ?').run(id, r).changes) > 0; },
    async prune(now, notesBefore) {
      q('DELETE FROM invites WHERE redeemed_by IS NULL AND expires_at < ?').run(now);
      q('DELETE FROM notes WHERE created_at < ?').run(notesBefore);
    },
    async close() { db.close(); },
  };
}
