'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageTitle, Screen } from '../Screen';
import { Chev } from '../Icon';
import { Seg } from '../controls';
import { EmptyState, Loading } from '../bits';
import { LineChart } from '../LineChart';
import { useDrift } from '@/lib/pipeline/useDrift';
import { buildTimeline, type RangeKey } from '@/lib/ui/timeline';
import { monthShort } from '@/lib/ui/format';
import type { TurningPoint } from '@/lib/types';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All' },
];

function TurningPointCard({ tp, linked }: { tp: TurningPoint; linked: boolean }) {
  const body = (
    <>
      <span className={tp.direction === 'up' ? 'up' : 'tiny'} style={{ width: 36, flex: 'none', fontSize: 13, fontWeight: 700 }}>{monthShort(tp.month)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b className="b15">{tp.label} {tp.direction === 'up' ? 'started rising' : 'began falling'}</b>
        <span className="small">{tp.explanation}</span>
      </span>
      {linked && <span style={{ alignSelf: 'center' }}><Chev /></span>}
    </>
  );
  const style = { flexDirection: 'row' as const, gap: 12 };
  return linked
    ? <Link href={`/topic/${encodeURIComponent(tp.topic)}`} className="card" style={style}>{body}</Link>
    : <div className="card" style={style}>{body}</div>;
}

export function TimelineScreen() {
  const { insights, status } = useDrift();
  const [range, setRange] = useState<RangeKey>('6m');
  const view = useMemo(() => buildTimeline(insights, range), [insights, range]);

  return (
    <Screen tabbed>
      <PageTitle>Interest timeline</PageTitle>
      <Seg label="Time range" options={RANGES} value={range} onChange={setRange} />
      {status !== 'ready' ? (
        <Loading blocks={[240, 30, 84]} />
      ) : !view ? (
        <EmptyState title="No timeline yet" action={{ href: '/connect', label: 'Add an export' }}>
          Once you import a few weeks of history, you&rsquo;ll see how your topics change month by month.
        </EmptyState>
      ) : (
        <>
          <LineChart labels={view.labels} series={view.series} marker={view.marker} ariaLabel={view.ariaLabel} />
          <h2>Turning points</h2>
          {insights.turningPoints.length === 0 && <span className="small">No sharp changes yet. Your topics have been steady.</span>}
          {insights.turningPoints.map((tp) => (
            <TurningPointCard key={`${tp.topic}-${tp.month}`} tp={tp} linked={!!insights.topics[tp.topic]} />
          ))}
        </>
      )}
    </Screen>
  );
}
