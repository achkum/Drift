import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createHouseholdClient, HouseholdError } from './client';
import { createHouseholdHandler } from './server/handler';
import { createMemoryStore } from './server/store';
import { CANARIES, adultInsights, teenInsights } from './testFixtures';

const BASE = 'http://drift.test/api/household';

function setup() {
  let clock = Date.parse('2026-10-18T12:00:00Z');
  const store = createMemoryStore();
  const handler = createHouseholdHandler({ store, now: () => clock, rateLimit: { burst: 10_000, perSecond: 1000 } });
  const wire: string[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const req = new Request(url, init);
    wire.push(`${init.method} ${url} ${typeof init.body === 'string' ? init.body : ''}`);
    return handler(req);
  };
  let n = 0;
  const client = (insights: () => ReturnType<typeof teenInsights> | null) => createHouseholdClient({
    dbName: `drift-household-test-${Date.now()}-${n++}`, baseUrl: BASE, fetch: fetchImpl, now: () => new Date(clock),
    getInsights: async () => insights(), origin: 'https://drift.test',
  });
  return { store, wire, client, advance: (ms: number) => { clock += ms; } };
}

const H = 3600 * 1000;

describe('household: owner and teen on two devices', () => {
  it('runs invite → consent → share → alert → questions → revoke → leave end to end', async () => {
    const { store, wire, client, advance } = setup();
    const parentInsights = adultInsights();
    const mayaInsights = teenInsights();
    const parent = client(() => parentInsights);
    const maya = client(() => mayaInsights);

    // SSR-safe identity and household creation.
    const me0 = await parent.getMe();
    expect(me0?.household).toBeNull();
    const me = await parent.createHousehold('Lindqvist home', 'Alex');
    expect(me.household).toMatchObject({ name: 'Lindqvist home', isOwner: true });
    expect(me.role).toBe('owner');

    // Invite a teen: link with secrets only in the fragment.
    const inv = await parent.createInvite('teen', { label: 'Maya' });
    expect(inv.url).toBe(`https://drift.test/join#${inv.fragment}`);
    expect(inv.qrPayload).toBe(inv.url);
    expect(Date.parse(inv.expiresAt) - Date.parse('2026-10-18T12:00:00Z')).toBe(7 * 24 * H);
    const [token] = inv.fragment.split('.');
    expect(wire.join('\n')).not.toContain(token);
    expect(wire.join('\n')).not.toContain('Lindqvist');
    expect((await parent.listMembers()).find((m) => m.status === 'invited')).toMatchObject({ displayName: 'Maya', role: 'teen' });

    // A teen must consent; the role must match the invite.
    await expect(maya.joinWithInvite(inv.url, 'Maya', 'teen')).rejects.toMatchObject({ code: 'consent_required' });
    const joined = await maya.joinWithInvite(inv.url, 'Maya', 'teen', { consent: true, share: { trends: true, sources: true, ads: true, questions: true, alerts: true } });
    expect(joined.household).toMatchObject({ name: 'Lindqvist home', ownerId: me.memberId, isOwner: false });
    expect(joined.role).toBe('teen');

    // Before the owner's device confirms, Maya sees the owner but publishes nothing to unknown keys.
    const mayaView0 = await maya.listMembers();
    expect(mayaView0.find((m) => m.isOwner)).toMatchObject({ displayName: 'Alex', status: 'active' });

    // Owner lists members → verifies the join proof → admits Maya.
    const members = await parent.listMembers();
    const mayaRow = members.find((m) => !m.isMe && !m.isOwner)!;
    expect(mayaRow).toMatchObject({ status: 'active', role: 'teen', displayName: 'Maya' });
    expect(members.some((m) => m.status === 'invited')).toBe(false);
    const mayaId = mayaRow.memberId;

    // Maya publishes. Her alert is shown to her at once, but not shared yet.
    const pub1 = await maya.publishSummaries();
    expect(pub1.published).toEqual([me.memberId]);
    expect(pub1.nextAlertReleaseAt).toBe(new Date(Date.parse('2026-10-18T12:00:00Z') + 48 * H).toISOString());
    const mayaAlerts = await maya.getSafetyAlerts();
    expect(mayaAlerts).toHaveLength(1);
    expect(mayaAlerts[0]).toMatchObject({ about: 'me', topic: 'dieting' });

    // Server holds only ciphertext.
    const serialized = JSON.stringify(await store.listShares(me.memberId));
    for (const s of ['Gaming', 'Maya', 'dieting', '[Account B]', ...CANARIES]) expect(serialized).not.toContain(s);

    // Parent fetches: trends/sources/ads, no sensitive topics, no alert yet.
    const [got] = await parent.fetchMemberSummaries();
    expect(got).toMatchObject({ memberId: mayaId, displayName: 'Maya', role: 'teen' });
    expect(got.summary.categories).toEqual(['trends', 'sources', 'ads', 'questions', 'alerts']);
    expect(JSON.stringify(got.summary).toLowerCase()).not.toContain('dieting');
    expect(got.summary.alerts).toEqual([]);
    expect(await parent.getSafetyAlerts()).toHaveLength(0);

    // Maya sees exactly what her parent sees.
    expect(await maya.previewWhatTheySee(me.memberId)).toEqual(got.summary);

    // 48 hours later the alert is released: "Maya was told first".
    advance(48 * H);
    const pub2 = await maya.publishSummaries();
    expect(pub2.published).toEqual([me.memberId]);
    await parent.fetchMemberSummaries();
    const parentAlerts = await parent.getSafetyAlerts();
    expect(parentAlerts).toHaveLength(1);
    expect(parentAlerts[0]).toMatchObject({ about: mayaId, aboutName: 'Maya', topic: 'dieting', toldMemberAt: '2026-10-18T12:00:00.000Z' });
    expect(parentAlerts[0].message).toContain('not a diagnosis');
    // Unchanged → nothing re-uploaded.
    expect((await maya.publishSummaries()).unchanged).toEqual([me.memberId]);

    // Questions: the parent asks, Maya sees every question and which categories were used.
    await parent.logQuestion(mayaId, 'Why did fitness content start showing up?', ['trends', 'sources', 'sensitive']);
    const qs = await maya.listQuestionsAboutMe();
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ askerId: me.memberId, askerName: 'Alex', question: 'Why did fitness content start showing up?', categories: ['trends', 'sources'] });
    expect(await store.listNotes(mayaId)).toHaveLength(0); // acked and deleted on the server
    expect(await maya.listQuestionsAboutMe()).toHaveLength(1); // kept on Maya's device

    // The parent can't ask about someone who hasn't allowed questions: Maya → parent shares nothing.
    await expect(maya.logQuestion(me.memberId, 'Hi?', ['trends'])).rejects.toMatchObject({ code: 'questions_not_allowed' });

    // Maya revokes questions and sources: takes effect at once.
    await maya.setShareSettings(me.memberId, { questions: false, sources: false });
    const [after] = await parent.fetchMemberSummaries();
    expect(after.summary.sources).toBeUndefined();
    expect(after.summary.allowQuestions).toBe(false);
    await expect(parent.logQuestion(mayaId, 'More?', ['trends'])).rejects.toBeInstanceOf(HouseholdError);

    // Turning everything off deletes the server copy; the parent's cache follows.
    await maya.setShareSettings(me.memberId, { trends: false, ads: false, alerts: false });
    expect(await store.listShares(me.memberId, 'summary')).toHaveLength(0);
    expect(await parent.fetchMemberSummaries()).toEqual([]);

    // The parent shares nothing with Maya by default.
    expect(await parent.getShareSettings(mayaId)).toMatchObject({ trends: false, sources: false, ads: false, questions: false, sensitive: false, alerts: false });
    expect(await maya.fetchMemberSummaries()).toEqual([]);
    await parent.setShareSettings(mayaId, { trends: true }, parentInsights);
    const [fromParent] = await maya.fetchMemberSummaries();
    expect(fromParent.summary.trends!.monthly.map((r) => r.topic)).toEqual(['football', 'other']); // politics is sensitive

    // Maya leaves: her server data is gone and the parent no longer lists her.
    await maya.leaveHousehold();
    expect((await maya.getMe())!.household).toBeNull();
    expect((await parent.listMembers()).map((m) => m.memberId)).toEqual([me.memberId]);
    expect(await store.listShares(mayaId)).toHaveLength(0);

    // Owner deletes everything, keys included.
    expect(await parent.deleteHouseholdData()).toEqual({ serverDeleted: true });
    expect(await store.getHousehold(me.household!.id)).toBeNull();
    const fresh = await parent.getMe();
    expect(fresh!.memberId).not.toBe(me.memberId);
  });

  it('refuses invites whose owner keys do not match the link fingerprint, and expired invites', async () => {
    const { client, advance, store } = setup();
    const owner = client(() => null);
    const other = client(() => null);
    const joiner = client(() => null);
    await owner.createHousehold('Home', 'Alex');
    await other.createHousehold('Other', 'Eve');
    const inv = await owner.createInvite('adult');
    const otherId = (await other.getMe())!.memberId;
    const [token] = inv.fragment.split('.');
    await expect(joiner.joinWithInvite(`${token}.${otherId}`, 'Sam', 'adult')).rejects.toMatchObject({ code: 'owner_mismatch' });
    // The failed attempt left the household again, but the invite is burnt.
    expect((await joiner.getMe())!.household).toBeNull();
    expect((await store.listMembers((await owner.getMe())!.household!.id))).toHaveLength(1);

    const inv2 = await owner.createInvite('teen');
    await expect(joiner.joinWithInvite(inv2.url, 'Sam', 'adult')).rejects.toMatchObject({ code: 'role_mismatch' });

    const inv3 = await owner.createInvite('adult');
    advance(7 * 24 * H + 1000);
    await expect(joiner.joinWithInvite(inv3.url, 'Sam', 'adult')).rejects.toSatisfy((e: unknown) => e instanceof HouseholdError && ['invite_expired', 'invite_not_found'].includes(e.code));
    expect((await owner.listMembers()).filter((m) => m.status === 'invited')).toHaveLength(0);
    await expect(joiner.joinWithInvite('garbage', 'Sam', 'adult')).rejects.toMatchObject({ code: 'bad_invite' });
  });

  it('does not trust members the owner never admitted (server-injected keys)', async () => {
    const { client, store } = setup();
    const owner = client(() => adultInsights());
    const sam = client(() => adultInsights());
    await owner.createHousehold('Home', 'Alex');
    const inv = await owner.createInvite('adult');
    await sam.joinWithInvite(inv.url, 'Sam', 'adult', { share: { trends: true } });
    const hid = (await owner.getMe())!.household!.id;
    // A malicious server adds its own key to the household.
    const { exportPublicKeys, generateDeviceKeys, memberIdFor } = await import('./crypto');
    const keys = await exportPublicKeys(await generateDeviceKeys());
    const malloryMe = { memberId: await memberIdFor(keys) };
    await store.addMember({ householdId: hid, memberId: malloryMe.memberId, ...keys, joinedAt: '2026-10-18T12:00:00Z', isOwner: false, inviteHash: null, joinProof: null, admission: 'forged' });
    // Garbage rows are ignored too.
    await store.addMember({ householdId: hid, memberId: 'garbage-member-id-000', ecdh: 'x', ecdsa: 'y', joinedAt: '2026-10-18T12:00:00Z', isOwner: false, inviteHash: null, joinProof: null, admission: null });
    // Sam (not owner) never shares with an unadmitted member.
    await sam.setShareSettings(malloryMe.memberId, { trends: true });
    const res = await sam.publishSummaries();
    expect(res.published).not.toContain(malloryMe.memberId);
    expect(await store.listShares(malloryMe.memberId)).toHaveLength(0);
    expect(res.published).toEqual([(await owner.getMe())!.memberId]);
    // Sam sees Mallory as pending (unconfirmed), never active.
    expect((await sam.listMembers()).find((m) => m.memberId === malloryMe.memberId)?.status).toBe('pending');
  });
});
