'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageTitle, PreviewTag, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { Choice, Seg, SwitchRow } from '../controls';
import { CmpRow, EmptyState, Loading } from '../bits';
import { useHousehold, useHouseholdLive } from '../HouseholdProvider';
import { useToast } from '../Toast';
import { useGoBack } from '../BackButton';
import { TeenConsentForm, type TeenFlags } from '../household/TeenConsent';
import {
  LiveAlertScreen, LiveCompareScreen, LiveInviteScreen, LiveQuestionsScreen, LiveSharingScreen,
} from './HouseholdLive';
import { CMP, QLOG, VIEWER_NAMES, type ShareFlags, type ShareFlagsWithSensitive, type Viewer } from '@/lib/sample/household';

// ── Real or sample ──────────────────────────────────────
// The sample people show under ?preview=1 and while you are not in a household.

function useLiveMode(preview: boolean): 'loading' | 'live' | 'sample' {
  const hh = useHouseholdLive();
  if (preview) return 'sample';
  if (hh.status === 'loading') return 'loading';
  return hh.inHousehold ? 'live' : 'sample';
}

function Wait() {
  return <Screen tabbed><Loading blocks={[40, 64, 160, 64]} /></Screen>;
}

export function CompareScreen({ preview = false }: { preview?: boolean }) {
  const mode = useLiveMode(preview);
  return mode === 'loading' ? <Wait /> : mode === 'live' ? <LiveCompareScreen /> : <SampleCompareScreen />;
}

export function SharingScreen({ preview = false }: { preview?: boolean }) {
  const mode = useLiveMode(preview);
  return mode === 'loading' ? <Wait /> : mode === 'live' ? <LiveSharingScreen /> : <SampleSharingScreen />;
}

export function InviteScreen({ preview = false }: { preview?: boolean }) {
  const mode = useLiveMode(preview);
  return mode === 'loading' ? <Wait /> : mode === 'live' ? <LiveInviteScreen /> : <SampleInviteScreen />;
}

export function QuestionsScreen({ preview = false }: { preview?: boolean }) {
  const mode = useLiveMode(preview);
  return mode === 'loading' ? <Wait /> : mode === 'live' ? <LiveQuestionsScreen /> : <SampleQuestionsScreen />;
}

/** `id` picks a real alert; without one, your newest real alert, else the sample. */
export function AlertScreen({ preview = false, id }: { preview?: boolean; id?: string }) {
  const hh = useHouseholdLive();
  if (preview) return <SampleAlertScreen />;
  if (hh.status === 'loading') return <Wait />;
  const alert = id ? hh.alerts.find((a) => a.id === id) : hh.alerts[0];
  if (alert) return <LiveAlertScreen alert={alert} hh={hh} />;
  if (!hh.inHousehold && !id && hh.alerts.length === 0) return <SampleAlertScreen />;
  return (
    <Screen back="/home">
      <PageTitle>Safety alert</PageTitle>
      <EmptyState title="No safety alert here" action={{ href: '/home', label: 'Back to overview' }}>
        It may have been hidden, or the person stopped sharing alerts with you.
      </EmptyState>
    </Screen>
  );
}

// ── Household compared ──────────────────────────────────

type CmpKey = keyof typeof CMP;

function SampleCompareScreen() {
  const [topic, setTopic] = useState<CmpKey>('fitness');
  const c = CMP[topic];
  return (
    <Screen tabbed back="/household?preview=1">
      <PageTitle>Household compared</PageTitle>
      <p className="small lead"><PreviewTag />Share of viewing in the last 30 days, next to other people.</p>
      <Seg
        label="Topic"
        options={(Object.keys(CMP) as CmpKey[]).map((k) => ({ value: k, label: CMP[k].label }))}
        value={topic}
        onChange={setTopic}
      />
      <div className="outline" style={{ gap: 14 }}>
        <span className="small">Share of viewing, last 30 days</span>
        {c.rows.map((r) => <CmpRow key={r.n} r={r} />)}
      </div>
      <div className="card">
        <b className="b16">What stands out</b>
        <span className="small t1">{c.note}</span>
      </div>
      <div className="outline" style={{ gap: 6 }}>
        <b style={{ fontSize: 15 }}>Where the comparisons come from</b>
        <span className="small"><b className="t1">Drift users:</b> anonymous, opt-in, grouped by age. Nobody can be identified.</span>
        <span className="small"><b className="t1">Published research:</b> dashed bars. Sources are placeholders for now: [Report name, year].</span>
        <span className="small">All numbers here are sample data.</span>
      </div>
      <Link href="/ask?about=household&preview=1" className="btn">Ask Drift about the household</Link>
    </Screen>
  );
}

// ── What you share ──────────────────────────────────────

const SHARE_ROWS: { cat: keyof ShareFlagsWithSensitive; title: string; detail: string }[] = [
  { cat: 'trends', title: 'Topic trends', detail: 'Your main topics, month by month' },
  { cat: 'sources', title: 'Where topics come from', detail: 'Chosen vs served, and the channels behind topics' },
  { cat: 'ads', title: 'Ads and interest lists', detail: 'Who targets you, and what each platform thinks you like' },
  { cat: 'ai', title: 'Questions to Drift', detail: 'They can ask Drift about your data. You see every question.' },
  { cat: 'sens', title: 'Sensitive topics', detail: 'Political lean, health and similar. Off unless you turn it on.' },
];

function SampleSharingScreen() {
  const { share, setShare } = useHousehold();
  const [who, setWho] = useState<Viewer>('sam');
  const name = VIEWER_NAMES[who];
  return (
    <Screen tabbed back="/household?preview=1">
      <PageTitle>What you share</PageTitle>
      <p className="small lead"><PreviewTag />Choose what each person can see.</p>
      <Seg
        label="Choose person"
        options={(['sam', 'maya'] as Viewer[]).map((v) => ({ value: v, label: `With ${VIEWER_NAMES[v]}` }))}
        value={who}
        onChange={setWho}
      />
      <div className="list">
        {SHARE_ROWS.map((r) => (
          <SwitchRow key={r.cat} title={r.title} detail={r.detail} checked={share[who][r.cat]} onChange={(v) => setShare(who, r.cat, v)} />
        ))}
      </div>
      <div className="card note">
        <Icon name="lock" />
        <span><b className="b15">Never shared</b><span className="small">Your messages and individual videos or searches. Drift&rsquo;s answers only use summaries.</span></span>
      </div>
      <div className="bottom">
        <Link href={`/household/you?preview=${who}`} className="btn">Preview what {name} sees</Link>
        <span className="tiny" style={{ textAlign: 'center' }}>Changes apply immediately. You can stop sharing anytime.</span>
      </div>
    </Screen>
  );
}

// ── Invite ──────────────────────────────────────────────

function SampleInviteScreen() {
  const [role, setRole] = useState<'adult' | 'teen'>('teen');
  const toast = useToast();
  return (
    <Screen back="/household?preview=1" closeButton>
      <PageTitle>Invite to your household</PageTitle>
      <p className="sub lead"><PreviewTag />They&rsquo;ll use Drift on their own device, with their own account.</p>
      <fieldset className="fieldset" style={{ gap: 10 }}>
        <legend style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Who are you inviting?</legend>
        <Choice name="role" size={16} title="An adult" detail="Partner or another adult. Nothing shared by default." checked={role === 'adult'} onChange={() => setRole('adult')} />
        <Choice name="role" size={16} title="A teen, 13–17" detail="They decide whether to share a weekly summary and safety alerts." checked={role === 'teen'} onChange={() => setRole('teen')} />
      </fieldset>
      <div className="card hrow" style={{ gap: 16 }}>
        <div className="qr" aria-hidden="true">[QR code]</div>
        <span className="small">Scan with their phone, or send the link. It expires in 7 days.</span>
      </div>
      <div className="bottom">
        <button type="button" className="btn" onClick={() => toast('This is a preview. Create a household to send a real invite.')}>Share invite link</button>
        {role === 'teen' && <Link href="/teen?preview=1" className="btn-text">See what a teen will be asked</Link>}
      </div>
    </Screen>
  );
}

// ── Teen consent ────────────────────────────────────────

/** Sample of the teen consent screen ("On Maya's phone"). The real one is part of /join. */
export function TeenScreen() {
  const { memberShared, setMemberShared } = useHousehold();
  const [flags, setFlags] = useState<TeenFlags>(() => {
    const m = memberShared.maya;
    return { trends: m.trends, sources: m.sources, ads: m.ads, questions: m.ai, alerts: true };
  });
  const toast = useToast();
  const goBack = useGoBack('/invite?preview=1');

  return (
    <Screen back="/invite?preview=1" right={<span className="tag tag-plain" style={{ marginRight: 12 }}>On Maya&rsquo;s phone</span>}>
      <PageTitle>Choose what your parent can see</PageTitle>
      <p className="sub lead"><PreviewTag />Your parent invited you to their household. You decide what to share, and you can change it anytime.</p>
      <TeenConsentForm flags={flags} onChange={setFlags} />
      <div className="bottom">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const next: ShareFlags = { trends: flags.trends, sources: flags.sources, ads: flags.ads, ai: flags.questions };
            setMemberShared('maya', next);
            toast('Your choices are saved. You can change them in Settings.');
            setTimeout(goBack, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
          }}
        >
          Save my choices
        </button>
        <button type="button" className="btn btn-2" onClick={goBack}>Not now</button>
      </div>
    </Screen>
  );
}

// ── Safety alert ────────────────────────────────────────

function SampleAlertScreen() {
  const toast = useToast();
  const goBack = useGoBack('/household/maya');
  const rows = [
    { title: 'Start a calm conversation', detail: 'Ideas for what to say, and what to avoid', msg: 'Conversation guide opens here.' },
    { title: 'Reset recommendations together', detail: 'Step-by-step for each platform', msg: 'Reset guide for each platform opens here.' },
    { title: 'Get professional support', detail: '[Eating-disorder and youth support lines]', msg: 'Support contacts open here.' },
  ];
  return (
    <Screen back="/household/maya">
      <div className="alert-ic"><Icon name="warn" /></div>
      <PageTitle style={{ fontSize: 26, lineHeight: '32px' }}>Maya&rsquo;s feed is shifting toward extreme dieting content</PageTitle>
      <p className="sub lead"><PreviewTag />Over 3 weeks, this grew from rare to about 1 in 5 videos. This is an estimate from her viewing, not a diagnosis.</p>
      <div className="card note" style={{ padding: '12px 14px' }}><Icon name="clock" /><span className="small">Maya was told first, 2 days ago.</span></div>
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
        <button type="button" className="btn-text" onClick={() => toast('Thanks. This helps Drift improve its alerts.')}>This doesn&rsquo;t look right</button>
      </div>
    </Screen>
  );
}

// ── Questions about you ─────────────────────────────────

function SampleQuestionsScreen() {
  return (
    <Screen tabbed back="/settings">
      <PageTitle>Questions about you</PageTitle>
      <p className="sub lead"><PreviewTag />When someone you share with asks Drift about you, it shows here. Answers are worked out on this device.</p>
      <div className="list">
        {QLOG.map((q, i) => (
          <div className="row top-align" key={i}>
            <span className={`avatar ${q.avatarClass}`} style={{ width: 36, height: 36, fontSize: 14 }} aria-hidden="true">{q.initial}</span>
            <span className="grow">
              <b style={{ fontSize: 15 }}>{q.who} asked</b>
              <span className="small">&ldquo;{q.q}&rdquo;</span>
              <span className="tiny">{q.meta}</span>
            </span>
          </div>
        ))}
      </div>
      <Link href="/sharing?preview=1" className="btn btn-2">Change who can ask</Link>
    </Screen>
  );
}
