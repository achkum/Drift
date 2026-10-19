'use client';
import Link from 'next/link';
import { PageTitle, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { ChosenBar, EmptyState, Loading, NavCard, SampleBanner } from '../bits';
import { useDrift } from '@/lib/pipeline/useDrift';
import { dateShort, signedPct } from '@/lib/ui/format';

function weekRange(weekOf: string): string {
  const start = new Date(weekOf);
  if (Number.isNaN(start.getTime())) return weekOf;
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return `${dateShort(start.toISOString(), false)} to ${dateShort(end.toISOString())}`;
}

export function DigestScreen() {
  const { insights, isSample, status } = useDrift();
  const { digest, chosen, rising, falling } = insights;

  if (status !== 'ready') {
    return <Screen tabbed back="/home"><PageTitle>This week</PageTitle><Loading blocks={[20, 140, 92, 120]} /></Screen>;
  }

  const moves = [...rising.slice(0, 2).map((r) => ({ ...r, up: true })), ...falling.slice(0, 2).map((r) => ({ ...r, up: false }))];
  const hasChosen = chosen.chosenPct + chosen.servedPct > 0;

  return (
    <Screen tabbed back="/home">
      <PageTitle>This week</PageTitle>
      {digest.weekOf && <span className="sub lead">Week of {weekRange(digest.weekOf)}</span>}
      {isSample && <SampleBanner />}

      {digest.lines.length === 0 ? (
        <EmptyState title="No digest yet" action={{ href: '/connect', label: 'Add a recent export' }}>
          Drift writes a digest for the latest full week in your history. Your exports don&rsquo;t cover a full recent week yet.
        </EmptyState>
      ) : (
        <div className="card" style={{ padding: 18, gap: 12 }}>
          <b className="b16">What changed</b>
          <ul className="insights">{digest.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}

      {hasChosen && (
        <NavCard href="/chosen" title="Chosen vs served">
          <ChosenBar chosenPct={chosen.chosenPct} />
          <span className="small">
            Over the last {chosen.windowDays} days, {Math.round(chosen.chosenPct)}% of what you watched followed a search, follow or subscription.
          </span>
        </NavCard>
      )}

      {moves.length > 0 && (
        <>
          <h2>Rising and falling</h2>
          <div className="list">
            {moves.map((m) => (
              <Link key={`${m.topic}-${m.up}`} href={`/topic/${encodeURIComponent(m.topic)}`} className="row">
                <span className="grow">
                  <b style={{ fontSize: 15 }}>{m.label}</b>
                  <span className="tiny">{Math.round(m.from)}% to {Math.round(m.to)}% of your viewing</span>
                </span>
                {m.up ? <span className="up">{signedPct(m.delta)}</span> : <b className="down">{signedPct(m.delta)}</b>}
                <Chev />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="bottom">
        <Link href="/ask?about=you" className="outline" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <span className="avatar av-ai"><Icon name="sparkle" /></span>
          <span style={{ flex: 1 }}><b className="b16">Ask about this week</b><span className="small">Why did it change? Where did it come from?</span></span>
          <Chev />
        </Link>
        <Link href="/timeline" className="btn btn-2">See the full timeline</Link>
      </div>
    </Screen>
  );
}
