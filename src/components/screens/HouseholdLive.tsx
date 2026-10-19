'use client';
// Real household screens, backed by src/lib/household. The sample versions live in
// Household.tsx / Member.tsx / HouseholdMore.tsx and are shown under ?preview=1.
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { Choice, Seg, SwitchRow } from '../controls';
import { CmpRow, EmptyState, Loading } from '../bits';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { useGoBack } from '../BackButton';
import { useHouseholdLive, type LiveHousehold } from '../HouseholdProvider';
import { LockedCard, SummaryView, topSeries } from '../household/SummaryPanels';
import { QrCode } from '../household/Qr';
import type {
  CreatedInvite, HouseholdMember, InviteRole, SafetyAlertView, ShareCategory, ShareSettings, SharedSummary,
} from '@/lib/household';
import { CAT_WORD } from '@/lib/household/ask';
import { ROLE_LABEL, avatarFor, firstName } from '@/lib/ui/useHousehold';
import { dateShort, joinAnd, monthLong } from '@/lib/ui/format';
import type { CmpRowData } from '@/lib/sample/household';

// ── helpers ─────────────────────────────────────────────

export function daysAgo(iso: string, now = Date.now()): string {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(d) || d <= 0) return 'today';
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function errText(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** "Trends and ads" from a list of categories. */
function catsLine(cats: ShareCategory[]): string {
  const words = cats.map((c) => CAT_WORD[c]);
  return words.length ? joinAnd(words) : 'nothing';
}

function onCats(s: Partial<ShareSettings> | undefined): ShareCategory[] {
  if (!s) return [];
  return (['trends', 'sources', 'ads', 'questions', 'alerts', 'sensitive'] as const).filter((c) => s[c]);
}

export function liveShareSummary(hh: LiveHousehold): string {
  const others = hh.members.filter((m) => !m.isMe && m.status === 'active');
  if (!others.length) return 'Nobody else has joined yet.';
  return others.map((m) => `With ${firstName(m.displayName)}: ${catsLine(onCats(hh.shareSettings[m.memberId]))}.`).join(' ');
}

function memberSub(m: HouseholdMember, hh: LiveHousehold): string {
  const role = ROLE_LABEL[m.role ?? ''] ?? 'Member';
  if (m.isMe) return `${role}, all your insights`;
  if (m.status === 'pending') return `Joined, waiting for ${hh.isOwner ? 'your' : 'the owner’s'} device to confirm`;
  if (m.status === 'invited') return `Invited${m.invite ? ` as ${m.invite.role === 'teen' ? 'a teen' : 'an adult'}, expires ${dateShort(m.invite.expiresAt, false)}` : ''}`;
  const r = hh.summaries[m.memberId];
  const cats = (r?.summary.categories ?? []).filter((c) => c !== 'sensitive');
  return cats.length ? `${role}, shares ${catsLine(cats)}` : `${role}, hasn’t shared anything with you yet`;
}

function Gate({ hh, children }: { hh: LiveHousehold; children: React.ReactNode }) {
  if (hh.status === 'loading') return <Loading blocks={[64, 64, 64, 56]} />;
  if (hh.gone) return <GoneCard hh={hh} />;
  return <>{children}</>;
}

function GoneCard({ hh }: { hh: LiveHousehold }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <b className="b16">You&rsquo;re no longer in {hh.me?.household?.name ?? 'this household'}</b>
      <span className="small">The owner removed you, or deleted the household. Nothing more is shared either way.</span>
      <button
        type="button"
        className="btn btn-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { leaveHousehold } = await import('@/lib/household');
            await leaveHousehold();
            await hh.refresh();
          } catch (e) { toast(errText(e)); } finally { setBusy(false); }
        }}
      >
        OK
      </button>
    </div>
  );
}

// ── Household tab: no household yet ─────────────────────

export function HouseholdEmpty() {
  const hh = useHouseholdLive();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [you, setYou] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!you.trim()) { toast('Add your name so others know who invited them.'); return; }
    setBusy(true);
    try {
      const { createHousehold } = await import('@/lib/household');
      await createHousehold(name.trim() || `${you.trim()}’s household`, you.trim());
      await hh.refresh();
      toast('Household created. Invite someone next.');
    } catch (err) {
      toast(errText(err, 'Couldn’t create the household. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const i = link.indexOf('#');
    if (i < 0) { toast('Paste the whole invite link, including the part after #.'); return; }
    router.push(`/join${link.slice(i)}`);
  }

  return (
    <>
      <p className="small lead">Each person uses Drift on their own device and chooses what to share. Nothing is shared by default.</p>
      {hh.status === 'unavailable' && <div className="card note"><Icon name="info" /><span className="small">This browser can&rsquo;t store household keys (private mode?). Household mode needs it.</span></div>}
      <form className="outline" style={{ gap: 12 }} onSubmit={create}>
        <b className="b16">Create a household</b>
        <label className="field">Household name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Lindqvist home" maxLength={60} autoComplete="off" /></label>
        <label className="field">Your name<input value={you} onChange={(e) => setYou(e.target.value)} placeholder="How others see you" maxLength={60} autoComplete="given-name" required /></label>
        <button type="submit" className="btn" disabled={busy || hh.status !== 'ready'}>{busy ? 'Creating…' : 'Create a household'}</button>
      </form>
      <form className="outline" style={{ gap: 12 }} onSubmit={join}>
        <b className="b16">Join with an invite link</b>
        <span className="small">Opening the link on this device works too.</span>
        <label className="field">Invite link<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/join#…" autoComplete="off" inputMode="url" /></label>
        <button type="submit" className="btn btn-2" disabled={!link.trim()}>Join with an invite link</button>
      </form>
      <Link href="/household?preview=1" className="btn-text">See a preview with sample people</Link>
    </>
  );
}

// ── Household tab: members ──────────────────────────────

export function LiveHouseholdScreen() {
  const hh = useHouseholdLive();
  const toast = useToast();
  const active = hh.members.filter((m) => m.status !== 'invited').length;
  const others = hh.members.filter((m) => !m.isMe && m.status === 'active');

  async function cancel(id: string) {
    try {
      const { cancelInvite } = await import('@/lib/household');
      await cancelInvite(id);
      await hh.refresh();
      toast('Invite cancelled. The link no longer works.');
    } catch (e) { toast(errText(e)); }
  }

  return (
    <Screen tabbed>
      <PageTitle>Household</PageTitle>
      <Gate hh={hh}>
        {!hh.inHousehold ? <HouseholdEmpty /> : (
          <>
            <p className="small lead">{hh.me?.household?.name}. {active} of 6 members. Everyone sees only what others choose to share.</p>
            {hh.error && <p className="tiny" role="status">Showing the last copy: {hh.error}</p>}
            <div className="list">
              {hh.members.map((m) => {
                const av = avatarFor(m);
                const alerts = hh.alerts.filter((a) => a.about === m.memberId).length;
                const body = (
                  <>
                    <span className={`avatar ${av.cls}`} aria-hidden="true">{av.initial}</span>
                    <span className="grow"><b>{m.isMe ? 'You' : m.displayName}</b><span className="small">{memberSub(m, hh)}</span></span>
                    {alerts > 0 && <span className="tag tag-amber">{alerts} alert{alerts > 1 ? 's' : ''}</span>}
                  </>
                );
                if (m.isMe) return <Link key={m.memberId} href="/home" className="row">{body}<Chev /></Link>;
                if (m.status === 'active') return <Link key={m.memberId} href={`/household/${encodeURIComponent(m.memberId)}`} className="row">{body}{!alerts && <Chev />}</Link>;
                return (
                  <div key={m.memberId} className="row">
                    {body}
                    {m.status === 'invited' && m.invite && (
                      <button type="button" className="btn-text" style={{ padding: 0, minHeight: 0 }} onClick={() => cancel(m.invite!.id)}>Cancel</button>
                    )}
                  </div>
                );
              })}
            </div>
            {hh.isOwner && (
              <Link href="/invite" className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <span className="avatar" style={{ background: 'var(--bg)' }}>
                  <Icon name="plus" style={{ width: 20, height: 20, fill: 'none', stroke: 'var(--t1)', strokeWidth: 2, strokeLinecap: 'round' }} />
                </span>
                <b style={{ fontSize: 16 }}>Invite someone</b>
              </Link>
            )}
            <Link href="/sharing" className="outline" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><b className="b16">What you share</b><span className="small">{liveShareSummary(hh)}</span></span>
              <Chev />
            </Link>
            {others.length > 0 && (
              <>
                <Link href="/household/compare" className="outline" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><b className="b16">Household compared</b><span className="small">{joinAnd(['You', ...others.map((m) => firstName(m.displayName))])} side by side</span></span>
                  <Chev />
                </Link>
                <Link href="/ask?about=household" className="btn"><Icon name="sparkleOne" />Ask Drift about your household</Link>
              </>
            )}
            <span className="tiny" style={{ textAlign: 'center' }}>Your code: {hh.me?.fingerprint}. Summaries are end-to-end encrypted; the server can&rsquo;t read them.</span>
          </>
        )}
      </Gate>
    </Screen>
  );
}

// ── Member view ─────────────────────────────────────────

function AlertBanner({ a }: { a: SafetyAlertView }) {
  const mine = a.about === 'me';
  return (
    <Link href={`/alert?id=${encodeURIComponent(a.id)}`} className="alert">
      <svg className="warn-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></svg>
      <span style={{ flex: 1 }}>
        <b className="b15">{mine ? 'Your feed' : 'Feed'} shifting toward {a.label.toLowerCase()}</b>
        <span className="small">{mine ? 'Only you can see this right now.' : `${firstName(a.aboutName)} was told first, ${daysAgo(a.toldMemberAt)}.`}</span>
      </span>
      <Chev />
    </Link>
  );
}
export { AlertBanner as LiveAlertBanner };

export function LiveMemberScreen({ memberId }: { memberId: string }) {
  const hh = useHouseholdLive();
  const toast = useToast();
  const m = hh.members.find((x) => x.memberId === memberId);
  const r = hh.summaries[memberId];
  const name = firstName(m?.displayName ?? r?.displayName);
  const av = m ? avatarFor(m) : { cls: 'av-sam', initial: name[0] ?? '?', color: 'var(--accent)' };

  return (
    <Screen tabbed back="/household">
      <Gate hh={hh}>
        {!m || m.isMe ? (
          <>
            <PageTitle>Not in your household</PageTitle>
            <EmptyState title="This person isn’t in your household" action={{ href: '/household', label: 'Back to household' }}>
              They may have left, or the link is from another device.
            </EmptyState>
          </>
        ) : (
          <>
            <div className="hrow">
              <span className={`avatar ${av.cls}`} style={{ width: 52, height: 52, fontSize: 20 }} aria-hidden="true">{av.initial}</span>
              <div style={{ minWidth: 0 }}>
                <PageTitle style={{ fontSize: 26 }}>{m.displayName}</PageTitle>
                <span className="small">
                  {ROLE_LABEL[m.role ?? ''] ?? 'Member'}. {r ? `Shared with you, updated ${daysAgo(r.sharedAt)}.` : m.status === 'pending' ? 'Waiting for the owner’s device to confirm the join.' : 'Nothing shared with you yet.'}
                </span>
              </div>
            </div>

            {hh.alerts.filter((a) => a.about === memberId).map((a) => <AlertBanner key={a.id} a={a} />)}

            {r?.summary.allowQuestions ? (
              <Link href={`/ask?about=${encodeURIComponent(memberId)}`} className="btn"><Icon name="sparkleOne" />Ask Drift about {name}</Link>
            ) : (
              <button type="button" className="btn btn-2" onClick={() => toast(`${name} chooses whether to allow questions. Ask them in person.`)}>
                <Icon name="sparkleOne" />{name} hasn&rsquo;t allowed questions
              </button>
            )}

            <SummaryView summary={r?.summary ?? null} name={name} mine={hh.myInsights} color={av.color} />

            <div className="outline">
              <b style={{ fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Icon name="lock" style={{ width: 16, height: 16, fill: 'none', stroke: 'var(--t2)', strokeWidth: 2 }} />Never shown
              </b>
              <span className="small">Messages, and individual videos or searches. Sensitive topics such as political lean and health stay hidden unless {name} allows them.</span>
              <button type="button" className="btn btn-2" onClick={() => toast(`${name} decides what to share. Ask them in person.`)}>Ask {name} to share more</button>
            </div>
            <p className="small" style={{ textAlign: 'center' }}>{name} can see exactly what you see on this page, and every question you ask.</p>
          </>
        )}
      </Gate>
    </Screen>
  );
}

// ── "Preview what X sees" ───────────────────────────────

export function LivePreviewScreen({ memberId }: { memberId: string }) {
  const hh = useHouseholdLive();
  const m = hh.members.find((x) => x.memberId === memberId);
  const viewer = firstName(m?.displayName);
  const settings = hh.shareSettings[memberId];
  const [summary, setSummary] = useState<SharedSummary | null | undefined>(undefined);
  const ins = hh.myInsights;
  const stamp = settings?.updatedAt ?? '';

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { previewWhatTheySee } = await import('@/lib/household');
        const s = await previewWhatTheySee(memberId, ins ?? undefined);
        if (live) setSummary(s);
      } catch { if (live) setSummary(null); }
    })();
    return () => { live = false; };
  }, [memberId, ins, stamp]);

  const cats = onCats(settings);
  return (
    <Screen tabbed back="/sharing">
      <div className="hrow">
        <span className="avatar av-you" style={{ width: 52, height: 52, fontSize: 15 }} aria-hidden="true">You</span>
        <div style={{ minWidth: 0 }}>
          <PageTitle style={{ fontSize: 26 }}>What {viewer} sees</PageTitle>
          <span className="small">Based on what you share with {viewer}. This is the exact summary {viewer}&rsquo;s device receives.</span>
        </div>
      </div>
      <Gate hh={hh}>
        {summary === undefined ? <Loading blocks={[44, 220, 120]} /> : !cats.length ? (
          <EmptyState title={`You share nothing with ${viewer}`} action={{ href: '/sharing', label: 'Choose what to share' }}>
            {viewer} sees your name and that you&rsquo;re in the household. Nothing else.
          </EmptyState>
        ) : !summary ? (
          <EmptyState title="Nothing to share yet" action={{ href: '/connect', label: 'Add your data' }}>
            Import an export first. Until then {viewer} sees nothing, even with sharing on.
          </EmptyState>
        ) : (
          <>
            <SummaryView summary={summary} name="You" preview={{ viewerName: viewer }} />
            {summary.allowQuestions
              ? <p className="small">{viewer} can ask Drift about this. You see every question in <Link href="/settings/questions" className="link">Questions about you</Link>.</p>
              : <LockedCard name="You" preview={{ viewerName: viewer }} cat="questions" />}
          </>
        )}
      </Gate>
      <div className="outline">
        <b style={{ fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="lock" style={{ width: 16, height: 16, fill: 'none', stroke: 'var(--t2)', strokeWidth: 2 }} />Never shown
        </b>
        <span className="small">Messages, and individual videos or searches. Sensitive topics such as political lean and health stay hidden unless you turn them on.</span>
      </div>
    </Screen>
  );
}

// ── Household compared ──────────────────────────────────

export function LiveCompareScreen() {
  const hh = useHouseholdLive();
  const people: { name: string; color: string; monthly: { topic: string; label: string; shares: number[] }[] }[] = [];
  if (hh.myInsights) people.push({ name: 'You', color: 'var(--t1)', monthly: hh.myInsights.monthly });
  for (const m of hh.members) {
    const t = hh.summaries[m.memberId]?.summary.trends;
    if (!m.isMe && t) people.push({ name: firstName(m.displayName), color: avatarFor(m).color, monthly: t.monthly });
  }
  const topics = new Map<string, string>();
  for (const p of people) for (const s of topSeries(p.monthly, 2)) if (topics.size < 4 && !topics.has(s.topic)) topics.set(s.topic, s.label);
  const keys = [...topics.keys()];
  const [topic, setTopic] = useState<string | null>(null);
  const cur = topic && topics.has(topic) ? topic : keys[0];
  const rows: CmpRowData[] = people.map((p) => ({
    n: p.name, c: p.color, v: Math.round(p.monthly.find((x) => x.topic === cur)?.shares.at(-1) ?? 0),
  }));
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const note = sorted.length > 1 && cur
    ? sorted[0].v === sorted.at(-1)!.v
      ? `${topics.get(cur)} takes about the same share for everyone.`
      : `${sorted[0].n === 'You' ? 'Your' : `${sorted[0].n}’s`} ${topics.get(cur)!.toLowerCase()} is the highest in the household, at ${sorted[0].v}% of viewing. ${sorted.at(-1)!.n === 'You' ? 'Yours' : `${sorted.at(-1)!.n}’s`} is ${sorted.at(-1)!.v}%.`
    : null;

  return (
    <Screen tabbed back="/household">
      <PageTitle>Household compared</PageTitle>
      <p className="small lead">Share of viewing in the latest month. Only people who share their trends with you appear.</p>
      <Gate hh={hh}>
        {!cur || people.length === 0 ? (
          <EmptyState title="Nothing to compare yet">Once someone shares their trends with you, and you have imported your own data, they show up side by side here.</EmptyState>
        ) : (
          <>
            <Seg label="Topic" options={keys.map((k) => ({ value: k, label: topics.get(k)! }))} value={cur} onChange={setTopic} />
            <div className="outline" style={{ gap: 14 }}>
              <span className="small">Share of viewing, latest month</span>
              {rows.map((r) => <CmpRow key={r.n} r={r} />)}
            </div>
            {note && <div className="card"><b className="b16">What stands out</b><span className="small t1">{note}</span></div>}
            <div className="outline" style={{ gap: 6 }}>
              <b style={{ fontSize: 15 }}>Where the comparisons come from</b>
              <span className="small">Each person&rsquo;s own device, from what they chose to share with you. Comparisons with other Drift users and published research come later.</span>
            </div>
            <Link href="/ask?about=household" className="btn">Ask Drift about the household</Link>
          </>
        )}
      </Gate>
    </Screen>
  );
}

// ── What you share ──────────────────────────────────────

export const SHARE_ROWS: { cat: ShareCategory; title: string; detail: string }[] = [
  { cat: 'trends', title: 'Topic trends', detail: 'Your main topics, month by month' },
  { cat: 'sources', title: 'Where topics come from', detail: 'Chosen vs served, and the channels behind topics' },
  { cat: 'ads', title: 'Ads and interest lists', detail: 'Who targets you, and what each platform thinks you like' },
  { cat: 'questions', title: 'Questions to Drift', detail: 'They can ask Drift about your data. You see every question.' },
  { cat: 'alerts', title: 'Safety alerts', detail: 'If your feed shifts sharply toward something harmful, they hear 2 days after you do.' },
  { cat: 'sensitive', title: 'Sensitive topics', detail: 'Political lean, health and similar. Off unless you turn it on.' },
];

export function LiveSharingScreen() {
  const hh = useHouseholdLive();
  const toast = useToast();
  const others = hh.members.filter((m) => !m.isMe && m.status === 'active');
  const [who, setWho] = useState<string | null>(null);
  const cur = others.find((m) => m.memberId === who) ?? others[0];
  const [pending, setPending] = useState<Partial<Record<ShareCategory, boolean>>>({});
  const settings = cur ? { ...hh.shareSettings[cur.memberId], ...pending } : undefined;

  async function toggle(cat: ShareCategory, v: boolean) {
    if (!cur) return;
    setPending((p) => ({ ...p, [cat]: v }));
    try {
      const { setShareSettings } = await import('@/lib/household');
      await setShareSettings(cur.memberId, { [cat]: v }, hh.myInsights ?? undefined);
      await hh.refresh();
    } catch (e) {
      toast(errText(e, 'Couldn’t save that. Try again.'));
    } finally {
      setPending((p) => { const n = { ...p }; delete n[cat]; return n; });
    }
  }

  const name = cur ? firstName(cur.displayName) : '';
  return (
    <Screen tabbed back="/household">
      <PageTitle>What you share</PageTitle>
      <p className="small lead">Choose what each person can see. Nothing is shared until you turn it on.</p>
      <Gate hh={hh}>
        {!cur ? (
          <EmptyState title="Nobody to share with yet" action={hh.isOwner ? { href: '/invite', label: 'Invite someone' } : undefined}>
            When someone joins your household, you choose here what they can see.
          </EmptyState>
        ) : (
          <>
            {others.length > 1 && (
              <Seg label="Choose person" options={others.map((m) => ({ value: m.memberId, label: `With ${firstName(m.displayName)}` }))} value={cur.memberId} onChange={(v) => { setWho(v); setPending({}); }} />
            )}
            {others.length === 1 && <h2 style={{ margin: 0 }}>With {name}</h2>}
            <div className="list">
              {SHARE_ROWS.map((r) => (
                <SwitchRow key={r.cat} title={r.title} detail={r.detail} checked={!!settings?.[r.cat]} onChange={(v) => void toggle(r.cat, v)} />
              ))}
            </div>
            {!hh.myInsights && <p className="tiny">You haven&rsquo;t imported your own data yet, so there is nothing to share until you do.</p>}
            <div className="card note">
              <Icon name="lock" />
              <span><b className="b15">Never shared</b><span className="small">Your messages and individual videos or searches. Drift&rsquo;s answers only use summaries.</span></span>
            </div>
            <div className="bottom">
              <Link href={`/household/you?as=${encodeURIComponent(cur.memberId)}`} className="btn">Preview what {name} sees</Link>
              <span className="tiny" style={{ textAlign: 'center' }}>Changes apply immediately. You can stop sharing anytime.</span>
            </div>
          </>
        )}
      </Gate>
    </Screen>
  );
}

// ── Invite ──────────────────────────────────────────────

/** The invite link with display hints (role, inviter name). Everything stays in the fragment. */
export function inviteLink(inv: CreatedInvite, inviter: string): string {
  const hints = new URLSearchParams({ r: inv.role, n: inviter.slice(0, 40) });
  return `${inv.url}&${hints.toString()}`;
}

export function LiveInviteScreen() {
  const hh = useHouseholdLive();
  const toast = useToast();
  const [role, setRole] = useState<InviteRole>('teen');
  const [label, setLabel] = useState('');
  const [inv, setInv] = useState<CreatedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const me = hh.me;
  const link = inv && me ? inviteLink(inv, me.displayName) : '';

  async function create() {
    setBusy(true);
    try {
      const { createInvite } = await import('@/lib/household');
      setInv(await createInvite(role, { label: label.trim() || undefined }));
      void hh.refresh();
    } catch (e) { toast(errText(e, 'Couldn’t create the invite. Try again.')); } finally { setBusy(false); }
  }

  async function share() {
    if (!link) return;
    const text = `Join my household on Drift. The link works once and expires ${dateShort(inv!.expiresAt)}.`;
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ title: 'Drift household invite', text, url: link }); return; }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(link); toast('Invite link copied.'); } catch { toast('Copy the link from the box above.'); }
  }

  async function cancel() {
    if (!inv) return;
    setBusy(true);
    try {
      const { cancelInvite } = await import('@/lib/household');
      await cancelInvite(inv.id);
      setInv(null);
      void hh.refresh();
      toast('Invite cancelled. The link no longer works.');
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  return (
    <Screen back="/household" closeButton>
      <PageTitle>Invite to your household</PageTitle>
      <p className="sub lead">They&rsquo;ll use Drift on their own device, with their own account.</p>
      <Gate hh={hh}>
        {!hh.inHousehold ? (
          <EmptyState title="Create a household first" action={{ href: '/household', label: 'Go to Household' }}>Then you can invite a partner or a teen.</EmptyState>
        ) : !hh.isOwner ? (
          <EmptyState title="Only the owner can invite">Ask the person who created {hh.me?.household?.name ?? 'the household'} to send an invite.</EmptyState>
        ) : !inv ? (
          <>
            <fieldset className="fieldset" style={{ gap: 10 }}>
              <legend style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Who are you inviting?</legend>
              <Choice name="role" size={16} title="An adult" detail="Partner or another adult. Nothing shared by default." checked={role === 'adult'} onChange={() => setRole('adult')} />
              <Choice name="role" size={16} title="A teen, 13–17" detail="They decide whether to share a weekly summary and safety alerts." checked={role === 'teen'} onChange={() => setRole('teen')} />
            </fieldset>
            <label className="field">Their name (only on this device)<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional" maxLength={60} autoComplete="off" /></label>
            <div className="bottom">
              <button type="button" className="btn" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create invite link'}</button>
              {role === 'teen' && <Link href="/teen?preview=1" className="btn-text">See what a teen will be asked</Link>}
            </div>
          </>
        ) : (
          <>
            <div className="card" style={{ alignItems: 'center', gap: 14 }}>
              <QrCode text={link} label={`QR code for the invite link for ${inv.role === 'teen' ? 'a teen' : 'an adult'}`} />
              <span className="small" style={{ textAlign: 'center' }}>Scan with their phone, or send the link. It works once and expires {dateShort(inv.expiresAt)}.</span>
            </div>
            <label className="field">Invite link<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label>
            <div className="card note">
              <Icon name="lock" />
              <span className="small">When they open it, Drift shows them your code <b className="t1">{me?.fingerprint}</b>. Check it matches before they join.</span>
            </div>
            <div className="bottom">
              <button type="button" className="btn" onClick={share}>Share invite link</button>
              <button type="button" className="btn btn-2" onClick={async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied.'); } catch { toast('Copy the link from the box above.'); } }}>Copy link</button>
              <button type="button" className="btn-text" disabled={busy} onClick={cancel}>Cancel invite</button>
            </div>
          </>
        )}
      </Gate>
    </Screen>
  );
}

// ── Safety alert ────────────────────────────────────────

export function LiveAlertScreen({ alert, hh }: { alert: SafetyAlertView; hh: LiveHousehold }) {
  const toast = useToast();
  const mine = alert.about === 'me';
  const goBack = useGoBack(mine ? '/home' : `/household/${encodeURIComponent(alert.about)}`);
  const name = firstName(alert.aboutName);
  const sharedWith = hh.members.filter((m) => !m.isMe && hh.shareSettings[m.memberId]?.alerts).map((m) => firstName(m.displayName));
  const span = alert.fromMonth && alert.toMonth ? `From ${monthLong(alert.fromMonth)} to ${monthLong(alert.toMonth)}` : 'Recently';
  const rows = mine ? [
    { title: 'Reset your recommendations', detail: 'Step-by-step for each platform', msg: 'Reset guides open here.' },
    { title: 'Talk to someone you trust', detail: 'A friend, a parent, a teacher or a school nurse', msg: 'Ideas for starting the conversation open here.' },
    { title: 'Get support', detail: '[Eating-disorder and youth support lines]', msg: 'Support contacts open here.' },
  ] : [
    { title: 'Start a calm conversation', detail: 'Ideas for what to say, and what to avoid', msg: 'Conversation guide opens here.' },
    { title: 'Reset recommendations together', detail: 'Step-by-step for each platform', msg: 'Reset guide for each platform opens here.' },
    { title: 'Get professional support', detail: '[Eating-disorder and youth support lines]', msg: 'Support contacts open here.' },
  ];

  async function dismiss() {
    if (!mine) { toast('Thanks. This helps Drift improve its alerts.'); return; }
    try {
      const { dismissSafetyAlert } = await import('@/lib/household');
      await dismissSafetyAlert(alert.id);
      await hh.refresh();
      toast('Hidden. This alert will never be shared.');
      goBack();
    } catch (e) { toast(errText(e)); }
  }

  return (
    <Screen back={mine ? '/home' : `/household/${encodeURIComponent(alert.about)}`}>
      <div className="alert-ic"><Icon name="warn" /></div>
      <PageTitle style={{ fontSize: 26, lineHeight: '32px' }}>{mine ? 'Your' : `${name}’s`} feed is shifting toward {alert.label.toLowerCase()} content</PageTitle>
      <p className="sub lead">{span}, this grew from {Math.round(alert.fromShare)}% to about {Math.round(alert.toShare)}% of {mine ? 'your' : 'their'} videos. This is an estimate from {mine ? 'your' : 'their'} viewing, not a diagnosis.</p>
      <div className="card note" style={{ padding: '12px 14px' }}>
        <Icon name="clock" />
        <span className="small">
          {mine
            ? sharedWith.length
              ? `You are told first. ${joinAnd(sharedWith)} hear${sharedWith.length === 1 ? 's' : ''} about it 2 days later, because you share safety alerts. Tap "This doesn't look right" to keep it private.`
              : 'Only you can see this. Nobody else hears about it unless you share safety alerts.'
            : `${name} was told first, ${daysAgo(alert.toldMemberAt)}.`}
        </span>
      </div>
      <h2>What can help</h2>
      <div className="list">
        {rows.map((r) => (
          <button type="button" className="row" key={r.title} onClick={() => toast(r.msg)}>
            <span className="grow"><b style={{ fontSize: 15 }}>{r.title}</b><span className="small">{r.detail}</span></span>
            <Chev />
          </button>
        ))}
      </div>
      <div className="bottom">
        <button type="button" className="btn" onClick={goBack}>Got it</button>
        <button type="button" className="btn-text" onClick={dismiss}>This doesn&rsquo;t look right</button>
      </div>
    </Screen>
  );
}

// ── Questions about you ─────────────────────────────────

export function LiveQuestionsScreen() {
  const hh = useHouseholdLive();
  return (
    <Screen tabbed back="/settings">
      <PageTitle>Questions about you</PageTitle>
      <p className="sub lead">When someone you share with asks Drift about you, it shows here. Their device works out the answer from what you share.</p>
      <Gate hh={hh}>
        {hh.questions.length === 0 ? (
          <EmptyState title="No questions yet">Nobody has asked Drift about you. If you allow questions, every one shows up here.</EmptyState>
        ) : (
          <div className="list">
            {hh.questions.map((q) => {
              const m = hh.members.find((x) => x.memberId === q.askerId);
              const av = avatarFor({ displayName: q.askerName, role: m?.role ?? null });
              return (
                <div className="row top-align" key={q.id}>
                  <span className={`avatar ${av.cls}`} style={{ width: 36, height: 36, fontSize: 14 }} aria-hidden="true">{av.initial}</span>
                  <span className="grow">
                    <b style={{ fontSize: 15 }}>{firstName(q.askerName)} asked</b>
                    <span className="small">&ldquo;{q.question}&rdquo;</span>
                    <span className="tiny">{dateShort(q.askedAt, false)}. Used your {q.categories.length ? catsLine(q.categories) : 'shared summary'}.</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Gate>
      <Link href="/sharing" className="btn btn-2">Change who can ask</Link>
    </Screen>
  );
}

// ── Settings: household section ─────────────────────────

export function HouseholdSettings() {
  const hh = useHouseholdLive();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'leave' | { remove: HouseholdMember }>(null);
  const [busy, setBusy] = useState(false);
  if (!hh.inHousehold || hh.gone) return null;
  const value = name ?? hh.me?.displayName ?? '';
  const others = hh.members.filter((m) => !m.isMe && m.status !== 'invited');

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      const lib = await import('@/lib/household');
      await lib.setDisplayName(value);
      await hh.refresh(); // re-sends your profile to everyone
      setName(null);
      toast('Saved. Others see the new name next time they open Drift.');
    } catch (err) { toast(errText(err)); } finally { setBusy(false); }
  }

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      const lib = await import('@/lib/household');
      if (confirm === 'leave') {
        await lib.leaveHousehold();
        toast(hh.isOwner ? 'Household deleted for everyone.' : 'You left the household. Nothing more is shared.');
      } else {
        await lib.removeMember(confirm.remove.memberId);
        toast(`${firstName(confirm.remove.displayName)} was removed.`);
      }
      setConfirm(null);
      await hh.refresh();
    } catch (err) { toast(errText(err)); } finally { setBusy(false); }
  }

  return (
    <>
      <form className="outline" style={{ gap: 10 }} onSubmit={saveName}>
        <label className="field">Your name in {hh.me?.household?.name}<input value={value} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" /></label>
        {name !== null && name !== hh.me?.displayName && <button type="submit" className="btn btn-2" disabled={busy || !value.trim()}>Save name</button>}
      </form>
      <div className="list">
        {hh.isOwner && others.map((m) => (
          <button key={m.memberId} type="button" className="row" onClick={() => setConfirm({ remove: m })}>
            <span className="grow"><b style={{ fontSize: 15 }}>Remove {m.displayName}</b><span className="tiny">Deletes everything shared to and from them</span></span>
          </button>
        ))}
        <button type="button" className="row" onClick={() => setConfirm('leave')}>
          <span className="grow">
            <b style={{ fontSize: 15, color: 'var(--red)' }}>{hh.isOwner ? 'Delete household' : 'Leave household'}</b>
            <span className="tiny">{hh.isOwner ? 'Removes everyone and deletes all shared summaries' : 'Stops sharing and deletes your shared summaries'}</span>
          </span>
        </button>
      </div>
      <Sheet
        open={confirm !== null}
        onClose={() => !busy && setConfirm(null)}
        title={confirm === 'leave' ? (hh.isOwner ? 'Delete the household?' : 'Leave the household?') : confirm ? `Remove ${firstName(confirm.remove.displayName)}?` : ''}
        role="alertdialog"
      >
        <span className="small">
          {confirm === 'leave'
            ? hh.isOwner
              ? 'Everyone is removed and every shared summary and question is deleted from the server. Your own data stays on this device.'
              : 'Your summaries are deleted from the server and nothing more is shared. Your own data stays on this device.'
            : 'They stop seeing what you share, and what they shared is deleted from the server. What their device already showed cannot be taken back.'}
        </span>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={run}>
          {busy ? 'Working…' : confirm === 'leave' ? (hh.isOwner ? 'Delete household' : 'Leave household') : 'Remove'}
        </button>
        <button type="button" className="btn btn-2" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
      </Sheet>
    </>
  );
}
