'use client';
// Member view panels (Trends / Sources / Ads / Compare) built from a real SharedSummary.
// Same markup and wording as the sample member screen.
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { Seg } from '../controls';
import { ChosenSummary, CmpRow, PlatformChosen } from '../bits';
import { LineChart } from '../LineChart';
import { useToast } from '../Toast';
import type { ShareCategory, SharedSummary } from '@/lib/household';
import { aboutPerson } from '@/lib/household/ask';
import type { Insights } from '@/lib/types';
import type { CmpRowData } from '@/lib/sample/household';
import { PLATFORM_LABEL, monthShort, num, plural } from '@/lib/ui/format';

export type Panel = 'trends' | 'sources' | 'ads' | 'compare';
const NEED: Record<Panel, ShareCategory> = { trends: 'trends', sources: 'sources', ads: 'ads', compare: 'trends' };
const PANELS: { value: Panel; label: string }[] = [
  { value: 'trends', label: 'Trends' },
  { value: 'sources', label: 'Sources' },
  { value: 'ads', label: 'Ads' },
  { value: 'compare', label: 'Compare' },
];
const PALETTE = ['var(--t1)', 'var(--accent)', 'var(--amber)', 'var(--muted-line)', 'var(--served)'];

const r0 = (n: number) => Math.round(n);

/** Top topics by latest share, 'other' last and left out. */
export function topSeries(monthly: { topic: string; label: string; shares: number[] }[], n = 4) {
  return monthly
    .filter((m) => m.topic !== 'other' && m.topic !== 'unknown')
    .sort((a, b) => (b.shares.at(-1) ?? 0) - (a.shares.at(-1) ?? 0))
    .slice(0, n);
}

export interface SummaryViewProps {
  summary: SharedSummary | null;
  /** First name of the member the summary is about, or 'You' in a preview. */
  name: string;
  /** Present when previewing what `viewerName` sees of you. */
  preview?: { viewerName: string };
  /** Your own real Insights, for Compare. */
  mine?: Insights | null;
  color?: string;
}

export function SummaryView(p: SummaryViewProps) {
  const [panel, setPanel] = useState<Panel>('trends');
  const s = p.summary;
  const ok = !!s && (
    panel === 'trends' || panel === 'compare' ? !!s.trends
      : panel === 'sources' ? !!s.sources
        : !!s.ads);
  return (
    <>
      <Seg label="Insight type" options={PANELS} value={panel} onChange={setPanel} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ok && s ? (
          panel === 'trends' ? <TrendsPanel s={s} {...p} />
            : panel === 'sources' ? <SourcesPanel s={s} {...p} />
              : panel === 'ads' ? <AdsPanel s={s} {...p} />
                : <ComparePanel s={s} {...p} />
        ) : <LockedCard name={p.name} preview={p.preview} cat={NEED[panel]} />}
      </div>
    </>
  );
}

type PanelProps = SummaryViewProps & { s: SharedSummary };

const possessive = (p: SummaryViewProps) => (p.preview ? 'your' : `${p.name}’s`);
const subject = (p: SummaryViewProps) => (p.preview ? 'you' : p.name);

function TrendsPanel(p: PanelProps) {
  const t = p.s.trends!;
  const alerted = new Set((p.s.alerts ?? []).map((a) => a.topic));
  const series = topSeries(t.monthly);
  const labels = t.months.map((m) => monthShort(m));
  if (!series.length || !labels.length) {
    return <div className="card"><span className="small">Not enough history to show trends yet.</span></div>;
  }
  const rows = series
    .map((x) => ({ n: x.label, d: r0((x.shares.at(-1) ?? 0) - (x.shares[0] ?? 0)), now: r0(x.shares.at(-1) ?? 0), warn: alerted.has(x.topic) }))
    .sort((a, b) => b.d - a.d);
  const desc = series.map((x) => `${x.label} from ${r0(x.shares[0] ?? 0)}% to ${r0(x.shares.at(-1) ?? 0)}%`).join(', ');
  const changes: string[] = [];
  for (const d of t.rising.slice(0, 2)) changes.push(`${d.label} grew from ${r0(d.from)}% to ${r0(d.to)}% of ${possessive(p)} viewing.`);
  for (const d of t.falling.slice(0, 1)) changes.push(`${d.label} fell by ${Math.abs(r0(d.delta))} points.`);
  for (const l of t.digest.lines.slice(0, 2)) changes.push(p.preview ? l : aboutPerson(l, p.name));
  return (
    <>
      <div className="outline">
        <b className="b16">Topics, month by month</b>
        <LineChart
          labels={labels}
          series={series.map((x, i) => ({
            key: x.topic, name: x.label, values: x.shares,
            color: alerted.has(x.topic) ? 'var(--amber)' : PALETTE[i % PALETTE.length], dash: i === 3,
          }))}
          ariaLabel={`Share of viewing by topic, ${labels[0]} to ${labels.at(-1)}. ${desc}.`}
        />
      </div>
      <div className="list">
        {rows.map((r) => (
          <div className="row" key={r.n}>
            <span className="grow"><b style={{ fontSize: 15 }}>{r.n}</b><span className="tiny">Now {r.now}% of viewing</span></span>
            <span className={r.warn ? 'warn' : r.d > 0 ? 'up' : 'down'}>{r.d > 0 ? '+' : r.d < 0 ? '−' : ''}{Math.abs(r.d)} pts</span>
          </div>
        ))}
      </div>
      {changes.length > 0 && (
        <div className="card">
          <b className="b16">What changed</b>
          <ul className="insights">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
    </>
  );
}

function SourcesPanel(p: PanelProps) {
  const src = p.s.sources!;
  const top = [...src.topics].sort((a, b) => b.itemCount * b.servedPct - a.itemCount * a.servedPct)[0];
  const platforms = src.chosen.byPlatform.filter((x) => x.items > 0);
  return (
    <>
      <ChosenSummary chosenPct={src.chosen.chosenPct}>
        <span className="small">Chosen means it followed a search, a follow or a subscription. Served is everything the platform put in front of {p.preview ? 'you' : 'them'}.</span>
      </ChosenSummary>
      {platforms.length > 0 && (
        <>
          <h2 style={{ marginTop: 0 }}>By platform</h2>
          {platforms.map((x) => <PlatformChosen key={x.platform} name={PLATFORM_LABEL[x.platform]} pct={x.chosenPct} />)}
        </>
      )}
      {top && top.sources.length > 0 && (
        <>
          <h2>Where {top.label} came from</h2>
          <div className="list">
            {top.sources.map((x) => (
              <div className="row" key={`${x.platform}:${x.name}`}>
                <span className="grow">
                  <b style={{ fontSize: 15 }}>{x.name}</b>
                  <span className="tiny">{PLATFORM_LABEL[x.platform]}, {plural(x.count, x.platform === 'google_search' ? 'search' : 'video', x.platform === 'google_search' ? 'searches' : 'videos')}{x.subscribed ? ', subscribed' : ''}</span>
                </span>
                <span className={`tag ${x.origin === 'served' ? 'tag-served' : 'tag-chosen'}`}>{x.origin === 'served' ? 'Served' : 'Chosen'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function AdsPanel(p: PanelProps) {
  const ads = p.s.ads!;
  const who = subject(p);
  const ig = ads.platformInterests.find((x) => x.interests.length > 0);
  const matches = ig ? ig.interests.filter((i) => i.matches).length : 0;
  const advertisers = ads.advertisers.slice(0, 6);
  const tactics = ads.tactics ?? [];
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Who targets {who}</h2>
      {advertisers.length ? (
        <div className="list">
          {advertisers.map((a) => (
            <div className="row" key={`${a.platform}:${a.name}`}>
              <span className="grow"><b style={{ fontSize: 15 }}>{a.name}</b><span className="tiny">{PLATFORM_LABEL[a.platform]}</span></span>
              {a.count !== undefined && <b style={{ fontSize: 15 }}>{num(a.count)} ads</b>}
            </div>
          ))}
        </div>
      ) : <span className="small">No advertisers in {possessive(p)} export.</span>}
      {tactics.length > 0 && (
        <div className="card">
          <b className="b16">Ad tricks seen</b>
          {tactics.map((t) => <span className="kv" key={t.id}>{t.label}<b>{num(t.count)}</b></span>)}
        </div>
      )}
      {ig && (
        <div className="outline" style={{ gap: 14 }}>
          <div className="hrow" style={{ gap: 10 }}>
            <span className="mono sm" aria-hidden="true">{PLATFORM_LABEL[ig.platform][0]}</span>
            <b style={{ fontSize: 17 }}>{PLATFORM_LABEL[ig.platform]} thinks {who}{p.preview ? '’re' : ' is'} into</b>
          </div>
          <ul className="chips" style={{ listStyle: 'none' }}>
            {ig.interests.slice(0, 12).map((i) => <li key={i.name} className={`chip${i.matches ? ' chip-match' : ''}`}>{i.name}</li>)}
          </ul>
          <span className="small"><b className="up">{matches} of {ig.interests.length}</b> match what {who} actually watch{p.preview ? '' : 'es'}. The rest come from ads and accounts never opened.</span>
        </div>
      )}
    </>
  );
}

function ComparePanel(p: PanelProps) {
  const t = p.s.trends!;
  const topics = topSeries(t.monthly, 3);
  const mine = p.preview ? null : p.mine;
  const myShare = (topic: string) => mine?.monthly.find((m) => m.topic === topic)?.shares.at(-1);
  const note = (() => {
    if (!topics.length) return null;
    const top = topics[0];
    const v = r0(top.shares.at(-1) ?? 0);
    const you = myShare(top.topic);
    if (you === undefined) return `${top.label} is ${possessive(p)} biggest topic, at ${v}% of viewing in the latest month.`;
    const y = r0(you);
    if (y === 0) return `${top.label} is ${p.name}’s biggest topic at ${v}%. It barely shows up in your feed.`;
    const ratio = v / y;
    return ratio >= 1.5 ? `${p.name}’s ${top.label.toLowerCase()} is about ${ratio.toFixed(1)} times yours.`
      : ratio <= 0.67 ? `Your ${top.label.toLowerCase()} is about ${(1 / ratio).toFixed(1)} times ${p.name}’s.`
        : `You and ${p.name} watch about the same amount of ${top.label.toLowerCase()}.`;
  })();
  return (
    <>
      <div className="outline" style={{ gap: 18 }}>
        <span className="small">Share of viewing, latest month.</span>
        {topics.map((x) => {
          const rows: CmpRowData[] = [{ n: p.preview ? 'You' : p.name, v: r0(x.shares.at(-1) ?? 0), c: p.color ?? 'var(--accent)' }];
          const y = myShare(x.topic);
          if (mine) rows.push({ n: 'You', v: r0(y ?? 0), c: 'var(--t1)' });
          return (
            <div key={x.topic} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b style={{ fontSize: 15 }}>{x.label}</b>
              {rows.map((r) => <CmpRow key={r.n} r={r} />)}
            </div>
          );
        })}
        {!topics.length && <span className="small">Not enough history to compare yet.</span>}
      </div>
      {note && (
        <div className="card">
          <b className="b16">What stands out</b>
          <span className="small t1">{note}</span>
        </div>
      )}
      <span className="tiny">Comparisons with other Drift users and published research come later.</span>
    </>
  );
}

const CAT_TITLE: Record<ShareCategory, string> = {
  trends: 'trends', sources: 'sources', ads: 'ads', questions: 'questions', sensitive: 'sensitive topics', alerts: 'safety alerts',
};

export function LockedCard({ name, preview, cat, children }: { name: string; preview?: { viewerName: string }; cat?: ShareCategory; children?: ReactNode }) {
  const toast = useToast();
  if (preview) {
    return (
      <div className="card lock">
        <Icon name="lock" />
        <b className="b16">Not shared with {preview.viewerName}</b>
        <span className="small">{preview.viewerName} can&rsquo;t see this. Turn it on in <Link href="/sharing" className="link">What you share</Link>.</span>
      </div>
    );
  }
  return (
    <div className="card lock">
      <Icon name="lock" />
      <b className="b16">{name} hasn&rsquo;t shared this</b>
      <span className="small">{name} decides what you can see. You can ask, and they can say no.</span>
      {children}
      <button type="button" className="btn btn-2" onClick={() => toast(`Ask ${name} in person to share ${cat ? CAT_TITLE[cat] : 'more'}. They choose in Drift.`)}>Ask {name} to share</button>
    </div>
  );
}
