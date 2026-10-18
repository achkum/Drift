'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageTitle, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { ChosenBar, Loading, NavCard, SampleBanner } from '../bits';
import { PersonSheet } from '../PersonSheet';
import { useDrift } from '@/lib/pipeline/useDrift';
import type { Insights, TopicDelta } from '@/lib/types';
import { currentMonth, dateShort, joinAnd, monthLong, num, PLATFORM_LABEL, signedPct } from '@/lib/ui/format';

export function syncedLine(insights: Insights): string {
  if (!insights.platforms.length) return 'No platforms imported yet';
  const labels = insights.platforms.map((p) => PLATFORM_LABEL[p.platform]);
  const latest = insights.platforms.map((p) => p.to).sort().at(-1);
  return `From ${joinAnd(labels)}${latest ? `, up to ${dateShort(latest)}` : ''}`;
}

export function rangeLine(r: Insights['range']): string | null {
  if (!r.monthThen || !r.monthNow || (!r.topicsThen && !r.topicsNow)) return null;
  const then = monthLong(r.monthThen);
  if (r.narrowing) return `Narrowing: ${r.topicsThen} topics made up most of your viewing in ${then}, ${r.topicsNow} now.`;
  if (r.topicsNow > r.topicsThen) return `Widening: ${r.topicsThen} topics made up most of your viewing in ${then}, ${r.topicsNow} now.`;
  return `Steady: about ${r.topicsNow} topics make up most of your viewing, as in ${then}.`;
}

function DeltaCard({ title, rows, kind }: { title: string; rows: TopicDelta[]; kind: 'up' | 'down' }) {
  return (
    <div className="card" style={{ padding: 14, gap: 8 }}>
      <span className="tiny" style={{ fontWeight: 700 }}>{title}</span>
      {rows.length === 0 && <span className="small">Nothing {kind === 'up' ? 'rising' : 'falling'} yet</span>}
      {rows.slice(0, 2).map((r) => (
        <Link key={r.topic} href={`/topic/${encodeURIComponent(r.topic)}`} className="kv" style={{ textDecoration: 'none' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          {kind === 'up' ? <span className="up">{signedPct(r.delta)}</span> : <b>{signedPct(r.delta)}</b>}
        </Link>
      ))}
    </div>
  );
}

export function HomeScreen() {
  const { insights, isSample, status } = useDrift();
  const [sheet, setSheet] = useState(false);
  const ready = status === 'ready';
  const last = insights.months.at(-1);
  const pi = insights.platformInterests[0];
  const range = rangeLine(insights.range);
  const hasChosen = insights.chosen.byPlatform.some((p) => p.items > 0) || insights.chosen.chosenPct + insights.chosen.servedPct > 0;

  return (
    <Screen tabbed>
      <div className="split">
        <PageTitle>Overview</PageTitle>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="Viewing your insights. Switch person"
          onClick={() => setSheet(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px 0 4px', border: '1px solid var(--line)', borderRadius: 999, fontSize: 15, fontWeight: 700 }}
        >
          <span className="avatar av-you" style={{ width: 32, height: 32, fontSize: 12 }}>You</span>
          <Icon name="down" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }} />
        </button>
      </div>

      {!ready ? (
        <Loading blocks={[20, 110, 72, 92, 108]} />
      ) : (
        <>
          <span className="tiny" style={{ marginTop: -8 }}>{syncedLine(insights)}</span>
          {isSample && <SampleBanner />}

          <Link href="/timeline" className="hero">
            <span className="muted tiny">{!last ? 'No history yet' : last === currentMonth() ? 'This month' : monthLong(last, true)}</span>
            <strong>{insights.headline.title || 'Not enough history to spot a drift yet'}</strong>
            <span className="muted">{insights.headline.detail || `Based on ${num(insights.totals.items)} videos and searches`}</span>
          </Link>

          <Link href="/ask?about=you" className="outline" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <span className="avatar av-ai"><Icon name="sparkle" /></span>
            <span style={{ flex: 1 }}><b className="b16">Ask Drift</b><span className="small">Why did your feed change? Where did it come from?</span></span>
            <Chev />
          </Link>

          <div className="grid2">
            <DeltaCard title="Rising" rows={insights.rising} kind="up" />
            <DeltaCard title="Falling" rows={insights.falling} kind="down" />
          </div>

          <NavCard href="/chosen" title="Chosen vs served">
            {hasChosen ? (
              <>
                <ChosenBar chosenPct={insights.chosen.chosenPct} />
                <span className="small">{Math.round(insights.chosen.chosenPct)}% of what you watched followed a search, follow or subscription.</span>
              </>
            ) : (
              <span className="small">Not enough recent activity to tell yet.</span>
            )}
          </NavCard>

          <NavCard href="/platforms" title="How platforms see you">
            <span className="small">
              {pi && pi.interests.length
                ? `${PLATFORM_LABEL[pi.platform]}’s interest list matches ${pi.interests.filter((i) => i.matches).length} of ${pi.interests.length} topics you actually watch.`
                : 'None of your exports include an interest list yet. See what Drift found instead.'}
            </span>
          </NavCard>

          {range && (
            <div className="outline">
              <span style={{ fontSize: 16, fontWeight: 700 }}>Topic range</span>
              <span className="small">{range}</span>
            </div>
          )}

          {insights.digest.lines.length > 0 && (
            <div className="card">
              <span className="split">
                <b className="b16">This week</b>
                {insights.digest.weekOf && <span className="tiny">Week of {dateShort(insights.digest.weekOf, false)}</span>}
              </span>
              <ul className="insights">{insights.digest.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        </>
      )}

      <PersonSheet open={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}
