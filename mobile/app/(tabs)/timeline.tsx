import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { TurningPoint } from '@/lib/types';
import { monthShort } from '@/lib/ui/format';
import { useDrift } from '../../src/data/useDrift';
import { buildTimeline, type RangeKey } from '../../src/ui/derive';
import { Card, EmptyState, H1, H2, Icon, Loading, Screen, Seg, T } from '../../src/ui/kit';
import { LineChart } from '../../src/ui/LineChart';
import { useTheme } from '../../src/ui/theme';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All' },
];

function TurningPointCard({ tp, linked }: { tp: TurningPoint; linked: boolean }) {
  const { c } = useTheme();
  return (
    <Card
      href={linked ? `/topic/${encodeURIComponent(tp.topic)}` : undefined}
      label={`${monthShort(tp.month)}: ${tp.label} ${tp.direction === 'up' ? 'started rising' : 'began falling'}. ${tp.explanation}`}
      style={{ flexDirection: 'row', gap: 12 }}
    >
      <T v="label" color={tp.direction === 'up' ? c.accentT : c.t2} style={{ width: 36 }}>{monthShort(tp.month)}</T>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="b15">{tp.label} {tp.direction === 'up' ? 'started rising' : 'began falling'}</T>
        <T v="small">{tp.explanation}</T>
      </View>
      {linked && <View style={{ alignSelf: 'center' }}><Icon name="chev" size={18} /></View>}
    </Card>
  );
}

export default function Timeline() {
  const { c } = useTheme();
  const { insights, status } = useDrift();
  const [range, setRange] = useState<RangeKey>('6m');
  const view = useMemo(() => buildTimeline(insights, range, c), [insights, range, c]);

  return (
    <Screen tabbed>
      <H1>Interest timeline</H1>
      <Seg<RangeKey> label="Time range" options={RANGES} value={range} onChange={setRange} />
      {status !== 'ready' ? (
        <Loading blocks={[240, 30, 84]} />
      ) : !view ? (
        <EmptyState title="No timeline yet" action={{ href: '/connect', label: 'Add an export' }}>
          Once you import a few weeks of history, you’ll see how your topics change month by month.
        </EmptyState>
      ) : (
        <>
          <LineChart labels={view.labels} series={view.series} marker={view.marker} ariaLabel={view.ariaLabel} />
          <H2>Turning points</H2>
          {insights.turningPoints.length === 0 && <T v="small">No sharp changes yet. Your topics have been steady.</T>}
          {insights.turningPoints.map((tp) => (
            <TurningPointCard key={`${tp.topic}-${tp.month}`} tp={tp} linked={!!insights.topics[tp.topic]} />
          ))}
        </>
      )}
    </Screen>
  );
}
