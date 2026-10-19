import { View } from 'react-native';
import { Avatar, Card, ChosenBar, H1, Icon, Loading, NavCard, Outline, SampleBanner, Split, T, Insights as InsightList, useGo } from '../../src/ui/kit';
import { adsLine, rangeLine, syncedLine } from '../../src/ui/derive';
import { Screen } from '../../src/ui/kit';
import { useDrift } from '../../src/data/useDrift';
import type { TopicDelta } from '@/lib/types';
import { currentMonth, dateShort, monthLong, num, PLATFORM_LABEL, signedPct } from '@/lib/ui/format';
import { useTheme } from '../../src/ui/theme';
import { Pressable } from 'react-native';

function DeltaCard({ title, rows, kind }: { title: string; rows: TopicDelta[]; kind: 'up' | 'down' }) {
  const { c } = useTheme();
  const go = useGo();
  return (
    <Card style={{ flex: 1, padding: 14, gap: 8 }}>
      <T v="label">{title}</T>
      {rows.length === 0 && <T v="small">Nothing {kind === 'up' ? 'rising' : 'falling'} yet</T>}
      {rows.slice(0, 2).map((r) => (
        <Pressable
          key={r.topic}
          onPress={() => go(`/topic/${encodeURIComponent(r.topic)}`)}
          accessibilityRole="link"
          accessibilityLabel={`${r.label}, ${signedPct(r.delta)}`}
          style={{ minHeight: 44, justifyContent: 'center', gap: 2 }}
        >
          <T numberOfLines={1} style={{ fontSize: 15 }}>{r.label}</T>
          <T w={700} style={{ fontSize: 15 }} color={kind === 'up' ? c.accentT : c.t1}>{signedPct(r.delta)}</T>
        </Pressable>
      ))}
    </Card>
  );
}

export default function Home() {
  const { c } = useTheme();
  const { insights, isSample, status } = useDrift();
  const ready = status === 'ready';
  const last = insights.months.at(-1);
  const pi = insights.platformInterests[0];
  const range = rangeLine(insights.range);
  const hasAds = insights.ads.advertisers.length > 0 || insights.ads.tactics.length > 0;
  const hasChosen = insights.chosen.byPlatform.some((p) => p.items > 0) || insights.chosen.chosenPct + insights.chosen.servedPct > 0;
  const go = useGo();

  return (
    <Screen tabbed>
      <Split>
        <H1>Overview</H1>
        <View accessible accessibilityLabel="Viewing your own insights" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 4, paddingRight: 12, borderWidth: 1, borderColor: c.line, borderRadius: 999 }}>
          <Avatar text="You" size={32} />
          <T w={700} style={{ fontSize: 15 }}>You</T>
        </View>
      </Split>

      {!ready ? (
        <Loading blocks={[20, 110, 72, 92, 108]} />
      ) : (
        <>
          <T v="tiny" style={{ marginTop: -8 }}>{syncedLine(insights)}</T>
          {isSample && <SampleBanner />}

          <Pressable
            onPress={() => go('/timeline')}
            accessibilityRole="link"
            style={{ backgroundColor: c.btn, borderRadius: 20, padding: 18, gap: 6 }}
          >
            <T v="tiny" color={c.btnT} style={{ opacity: 0.72 }}>{!last ? 'No history yet' : last === currentMonth() ? 'This month' : monthLong(last, true)}</T>
            <T v="stat" color={c.btnT}>{insights.headline.title || 'Not enough history to spot a drift yet'}</T>
            <T v="small" color={c.btnT} style={{ opacity: 0.72 }}>{insights.headline.detail || `Based on ${num(insights.totals.items)} videos and searches`}</T>
          </Pressable>

          <Outline href="/ask?about=you" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar text="" kind="ai" size={40} />
            <View style={{ flex: 1 }}>
              <T v="b16">Ask Drift</T>
              <T v="small">Why did your feed change? Where did it come from?</T>
            </View>
            <Icon name="chev" size={18} />
          </Outline>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <DeltaCard title="Rising" rows={insights.rising} kind="up" />
            <DeltaCard title="Falling" rows={insights.falling} kind="down" />
          </View>

          <NavCard href="/chosen" title="Chosen vs served">
            {hasChosen ? (
              <>
                <ChosenBar chosenPct={insights.chosen.chosenPct} />
                <T v="small">{Math.round(insights.chosen.chosenPct)}% of what you watched followed a search, follow or subscription.</T>
              </>
            ) : (
              <T v="small">Not enough recent activity to tell yet.</T>
            )}
          </NavCard>

          <NavCard href="/platforms" title="How platforms see you">
            <T v="small">
              {pi && pi.interests.length
                ? `${PLATFORM_LABEL[pi.platform]}’s interest list matches ${pi.interests.filter((i) => i.matches).length} of ${pi.interests.length} topics you actually watch.`
                : 'None of your exports include an interest list yet. See what Drift found instead.'}
            </T>
          </NavCard>

          {range && (
            <Outline>
              <T v="b16">Topic range</T>
              <T v="small">{range}</T>
            </Outline>
          )}

          {hasAds && (
            <NavCard href="/ads" title="Who targets you">
              <T v="small">{adsLine(insights.ads)}</T>
            </NavCard>
          )}

          {insights.digest.lines.length > 0 && (
            <Card href="/digest">
              <Split>
                <T v="b16">This week</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {insights.digest.weekOf ? <T v="tiny">Week of {dateShort(insights.digest.weekOf, false)}</T> : null}
                  <Icon name="chev" size={18} />
                </View>
              </Split>
              <InsightList lines={insights.digest.lines.slice(0, 3)} />
              {insights.digest.lines.length > 3 && <T v="tiny">{insights.digest.lines.length - 3} more in the digest</T>}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
