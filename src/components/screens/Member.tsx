'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageTitle, PreviewTag, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { Seg } from '../controls';
import { ChosenSummary, CmpRow, PlatformChosen } from '../bits';
import { LineChart } from '../LineChart';
import { useHousehold } from '../HouseholdProvider';
import { useToast } from '../Toast';
import {
  MEMBERS, MEMBER_LABELS, VIEWER_NAMES,
  type CmpRowData, type Member, type MemberKey, type ShareCategory, type Viewer,
} from '@/lib/sample/household';

type Panel = 'trends' | 'sources' | 'ads' | 'compare';
const NEED: Record<Panel, ShareCategory> = { trends: 'trends', sources: 'sources', ads: 'ads', compare: 'trends' };
const PANELS: { value: Panel; label: string }[] = [
  { value: 'trends', label: 'Trends' },
  { value: 'sources', label: 'Sources' },
  { value: 'ads', label: 'Ads' },
  { value: 'compare', label: 'Compare' },
];

function TrendsPanel({ m }: { m: Member }) {
  const rows = m.series
    .map((s) => ({ n: s.name, d: s.vals[s.vals.length - 1] - s.vals[0], now: s.vals[s.vals.length - 1], warn: s.warn }))
    .sort((a, b) => b.d - a.d);
  const desc = m.series.map((s) => `${s.name} from ${s.vals[0]}% to ${s.vals[s.vals.length - 1]}%`).join(', ');
  return (
    <>
      <div className="outline">
        <b className="b16">Topics, month by month</b>
        <LineChart
          labels={MEMBER_LABELS}
          series={m.series.map((s) => ({ key: s.name, name: s.name, values: s.vals, color: s.color, dash: s.dash }))}
          ariaLabel={`Share of viewing by topic, May to October. ${desc}.`}
        />
      </div>
      <div className="list">
        {rows.map((r) => (
          <div className="row" key={r.n}>
            <span className="grow"><b style={{ fontSize: 15 }}>{r.n}</b><span className="tiny">Now {r.now}% of viewing</span></span>
            <span className={r.warn ? 'warn' : r.d > 0 ? 'up' : 'down'}>{r.d > 0 ? '+' : '−'}{Math.abs(r.d)} pts</span>
          </div>
        ))}
      </div>
      <div className="card">
        <b className="b16">What changed</b>
        <ul className="insights">{m.changes.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
    </>
  );
}

function SourcesPanel({ m }: { m: Member }) {
  return (
    <>
      <ChosenSummary chosenPct={m.chosen}>
        <span className="small">Chosen means it followed a search, a follow or a subscription. Served is everything the platform put in front of {m.key === 'you' ? 'you' : 'them'}.</span>
      </ChosenSummary>
      <h2 style={{ marginTop: 0 }}>By platform</h2>
      {m.platforms.map(([n, v]) => <PlatformChosen key={n} name={n} pct={v} />)}
      <h2>Where {m.srcTopic} came from</h2>
      <div className="list">
        {m.srcRows.map(([name, detail, kind]) => (
          <div className="row" key={name}>
            <span className="grow"><b style={{ fontSize: 15 }}>{name}</b><span className="tiny">{detail}</span></span>
            <span className={`tag ${kind === 'served' ? 'tag-served' : 'tag-chosen'}`}>{kind === 'served' ? 'Served' : 'Chosen'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function AdsPanel({ m }: { m: Member }) {
  const you = m.key === 'you';
  const who = you ? 'you' : m.first;
  const matches = m.ig[1].filter(([, ok]) => ok).length;
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Who targets {who}</h2>
      <div className="list">
        {m.ads.map(([name, interest, n]) => (
          <div className="row" key={name}>
            <span className="grow"><b style={{ fontSize: 15 }}>{name}</b><span className="tiny">Used the interest {interest}</span></span>
            <b style={{ fontSize: 15 }}>{n} ads</b>
          </div>
        ))}
      </div>
      <div className="card">
        <b className="b16">Ad tricks seen</b>
        {m.tactics.map(([t, n]) => <span className="kv" key={t}>{t}<b>{n}</b></span>)}
      </div>
      <div className="outline" style={{ gap: 14 }}>
        <div className="hrow" style={{ gap: 10 }}>
          <span className="mono sm" aria-hidden="true">I</span>
          <b style={{ fontSize: 17 }}>{m.ig[0]} thinks {who}{you ? '’re' : ' is'} into</b>
        </div>
        <ul className="chips" style={{ listStyle: 'none' }}>
          {m.ig[1].map(([name, ok]) => <li key={name} className={`chip${ok ? ' chip-match' : ''}`}>{name}</li>)}
        </ul>
        <span className="small"><b className="up">{matches} of {m.ig[1].length}</b> match what {who} actually watch{you ? '' : 'es'}. The rest come from ads and accounts never opened.</span>
      </div>
    </>
  );
}

function ComparePanel({ m }: { m: Member }) {
  const you = m.key === 'you';
  return (
    <>
      <div className="outline" style={{ gap: 18 }}>
        <span className="small">Share of viewing, last 30 days. Sample data.</span>
        {m.cmp.map((c) => {
          const rows: CmpRowData[] = [{ n: m.first, v: c.self, c: m.color }];
          if (!you && c.you !== undefined) rows.push({ n: 'You', v: c.you, c: 'var(--t1)' });
          rows.push({ n: m.driftLabel, s: 'Anonymous, opt-in', v: c.drift, c: 'var(--muted-line)' });
          rows.push({ n: 'Published research', s: '[Report name, year]', v: c.res, c: 'var(--muted-line)', k: 'r' });
          return (
            <div key={c.t} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b style={{ fontSize: 15 }}>{c.t}</b>
              {rows.map((r) => <CmpRow key={r.n} r={r} />)}
            </div>
          );
        })}
      </div>
      <div className="card">
        <b className="b16">What stands out</b>
        <span className="small t1">{m.cmpNote}</span>
      </div>
    </>
  );
}

function LockedCard({ m, preview, viewer }: { m: Member; preview: boolean; viewer: string }) {
  const toast = useToast();
  if (preview) {
    return (
      <div className="card lock">
        <Icon name="lock" />
        <b className="b16">Not shared with {viewer}</b>
        <span className="small">{viewer} can&rsquo;t see this. Turn it on in <Link href="/sharing?preview=1" className="link">What you share</Link>.</span>
      </div>
    );
  }
  return (
    <div className="card lock">
      <Icon name="lock" />
      <b className="b16">{m.first} hasn&rsquo;t shared this</b>
      <span className="small">{m.first} decides what you can see. You can ask, and they can say no.</span>
      <button type="button" className="btn btn-2" onClick={() => toast(`Request sent to ${m.first}. They choose whether to share.`)}>Ask {m.first} to share</button>
    </div>
  );
}

export function MemberScreen({ memberKey, preview }: { memberKey: MemberKey; preview?: Viewer }) {
  const { share, memberShared } = useHousehold();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>('trends');
  const m = MEMBERS[memberKey];
  const p = !!preview;
  const viewer = VIEWER_NAMES[preview ?? 'sam'];
  const flags = preview ? share[preview] : memberShared[memberKey];
  const ok = flags[NEED[panel]];
  const Body = { trends: TrendsPanel, sources: SourcesPanel, ads: AdsPanel, compare: ComparePanel }[panel];

  return (
    <Screen tabbed back={p ? '/sharing?preview=1' : '/household?preview=1'}>
      <div className="hrow">
        <span className={`avatar ${p ? 'av-you' : m.avatarClass}`} style={{ width: 52, height: 52, fontSize: p ? 15 : 20 }} aria-hidden="true">
          {p ? 'You' : m.initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <PageTitle style={{ fontSize: 26 }}>{p ? `What ${viewer} sees` : m.displayName}</PageTitle>
          <span className="small"><PreviewTag />{p ? `Based on what you share with ${viewer}` : m.sub}</span>
        </div>
      </div>

      {!p && m.alert && (
        <Link href="/alert?preview=1" className="alert">
          <svg className="warn-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></svg>
          <span style={{ flex: 1 }}><b className="b15">Feed shifting toward extreme dieting</b><span className="small">Maya was told first, 2 days ago.</span></span>
          <Chev />
        </Link>
      )}

      {!p && (flags.ai ? (
        <Link href={`/ask?about=${memberKey}`} className="btn"><Icon name="sparkleOne" />Ask Drift about {m.first}</Link>
      ) : (
        <button type="button" className="btn btn-2" onClick={() => toast(`Request sent to ${m.first}. They choose whether to allow questions.`)}>
          <Icon name="sparkleOne" />{m.first} hasn&rsquo;t allowed questions
        </button>
      ))}

      <Seg label="Insight type" options={PANELS} value={panel} onChange={setPanel} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ok ? <Body m={m} /> : <LockedCard m={m} preview={p} viewer={viewer} />}
      </div>

      <div className="outline">
        <b style={{ fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="lock" style={{ width: 16, height: 16, fill: 'none', stroke: 'var(--t2)', strokeWidth: 2 }} />Never shown
        </b>
        <span className="small">
          Messages, and individual videos or searches. Sensitive topics such as political lean and health stay hidden unless {p ? 'you turn them on' : `${m.first} allows them`}.
        </span>
        {!p && (
          <button type="button" className="btn btn-2" onClick={() => toast(`Request sent to ${m.first}. They choose whether to share.`)}>
            Ask {m.first} to share more
          </button>
        )}
      </div>
      {!p && <p className="small" style={{ textAlign: 'center' }}>{m.first} can see exactly what you see on this page, and every question you ask.</p>}
    </Screen>
  );
}
