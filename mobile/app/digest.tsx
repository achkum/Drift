import { View } from 'react-native';
import { dateShort, signedPct } from '@/lib/ui/format';
import { useDrift } from '../src/data/useDrift';
import { Bottom, Btn, Card, ChosenBar, EmptyState, Grow, H1, H2, Insights, List, Loading, NavCard, Outline, Row, SampleBanner, Screen, T, Avatar, Icon } from '../src/ui/kit';
import { useTheme } from '../src/ui/theme';

function weekRange(weekOf: string): string {
  const start = new Date(weekOf);
  if (Number.isNaN(start.getTime())) return weekOf;
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return `${dateShort(start.toISOString(), false)} to ${dateShort(end.toISOString())}`;
}

export default function Digest() {
  const { c } = useTheme();
  const { insights, isSample, status } = useDrift();
  const { digest, chosen, rising, falling } = insights;

  if (status !== 'ready') {
    return <Screen back="/home"><H1>This week</H1><Loading blocks={[20, 140, 92, 120]} /></Screen>;
  }

  const moves = [...rising.slice(0, 2).map((r) => ({ ...r, up: true })), ...falling.slice(0, 2).map((r) => ({ ...r, up: false }))];
  const hasChosen = chosen.chosenPct + chosen.servedPct > 0;

  return (
    <Screen back="/home">
      <H1>This week</H1>
      {digest.weekOf ? <T v="sub" style={{ marginTop: -6 }}>Week of {weekRange(digest.weekOf)}</T> : null}
      {isSample && <SampleBanner />}

      {digest.lines.length === 0 ? (
        <EmptyState title="No digest yet" action={{ href: '/connect', label: 'Add a recent export' }}>
          Drift writes a digest for the latest full week in your history. Your exports don’t cover a full recent week yet.
        </EmptyState>
      ) : (
        <Card style={{ padding: 18, gap: 12 }}>
          <T v="b16">What changed</T>
          <Insights lines={digest.lines} />
        </Card>
      )}

      {hasChosen && (
        <NavCard href="/chosen" title="Chosen vs served">
          <ChosenBar chosenPct={chosen.chosenPct} />
          <T v="small">Over the last {chosen.windowDays} days, {Math.round(chosen.chosenPct)}% of what you watched followed a search, follow or subscription.</T>
        </NavCard>
      )}

      {moves.length > 0 && (
        <>
          <H2>Rising and falling</H2>
          <List>
            {moves.map((m) => (
              <Row key={`${m.topic}-${m.up}`} href={`/topic/${encodeURIComponent(m.topic)}`} chev label={`${m.label}, ${signedPct(m.delta)}`}>
                <Grow title={m.label} detail={`${Math.round(m.from)}% to ${Math.round(m.to)}% of your viewing`} />
                <T w={700} color={m.up ? c.accentT : c.t2} style={{ fontSize: 15 }}>{signedPct(m.delta)}</T>
              </Row>
            ))}
          </List>
        </>
      )}

      <Bottom>
        <Outline href="/ask?about=you" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar text="" kind="ai" size={40} />
          <View style={{ flex: 1 }}><T v="b16">Ask about this week</T><T v="small">Why did it change? Where did it come from?</T></View>
          <Icon name="chev" size={18} />
        </Outline>
        <Btn kind="secondary" href="/timeline">See the full timeline</Btn>
      </Bottom>
    </Screen>
  );
}
