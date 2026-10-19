import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { RECOMMENDATION_ACTIONS } from '@/lib/ui/actions';
import type { Origin, Platform, TopicDetail } from '@/lib/types';
import { dateShort, monthLong, num, PLATFORM_LABEL } from '@/lib/ui/format';
import { useDrift } from '../../src/data/useDrift';
import { Icon } from '../../src/ui/Icon';
import { Bottom, Btn, Card, EmptyState, ExternalRow, Grow, GroupLabel, H1, H2, List, Loading, Note, Row, Screen, T, Tag } from '../../src/ui/kit';
import { useTheme } from '../../src/ui/theme';

const FEWER_TIP: Partial<Record<Platform, string>> = {
  youtube: 'On YouTube, tap the three dots next to one of these videos and choose Don’t recommend channel. Not interested works for single videos.',
  tiktok: 'On TikTok, press and hold one of these videos and tap Not interested. You can also filter keywords in Settings, Content preferences.',
  instagram: 'On Instagram, tap the three dots on one of these posts and choose Not interested.',
};

function unit(p: Platform, n: number) {
  if (p === 'google_search') return n === 1 ? 'search' : 'searches';
  if (p === 'instagram') return n === 1 ? 'post' : 'posts';
  return n === 1 ? 'video' : 'videos';
}

function OriginTag({ origin }: { origin: Origin }) {
  const chosen = origin === 'chosen' || origin === 'engaged';
  return <Tag kind={chosen ? 'chosen' : origin === 'pushed' ? 'amber' : 'served'}>{origin === 'pushed' ? 'Ad' : chosen ? 'Chosen' : 'Served'}</Tag>;
}

function topServedPlatform(d: TopicDetail): Platform | undefined {
  const byPlatform = new Map<Platform, number>();
  d.sources.filter((s) => s.origin === 'served' && FEWER_TIP[s.platform]).forEach((s) => byPlatform.set(s.platform, (byPlatform.get(s.platform) ?? 0) + s.count));
  return [...byPlatform.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export default function Topic() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(raw ?? '');
  const { c } = useTheme();
  const { insights, status } = useDrift();
  const [showItems, setShowItems] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const d = insights.topics[id];

  if (status !== 'ready') {
    return <Screen back="/timeline"><H1>Topic</H1><Loading blocks={[96, 30, 168, 54]} /></Screen>;
  }
  if (!d) {
    return (
      <Screen back="/timeline">
        <H1>Topic not found</H1>
        <EmptyState title="Nothing to show" action={{ href: '/timeline', label: 'Back to the timeline' }}>
          This topic isn’t in your current results. It may have been removed when your data changed.
        </EmptyState>
      </Screen>
    );
  }

  const platform = topServedPlatform(d);
  const sources = [...d.sources].sort((a, b) => b.count - a.count);
  const sameMonth = d.fromMonth === d.toMonth;
  const actionPlatforms = [...new Set([platform, ...sources.map((s) => s.platform)])]
    .filter((p): p is Platform => !!p && !!RECOMMENDATION_ACTIONS[p]);

  return (
    <Screen back="/timeline">
      <H1>{d.label}</H1>
      {d.sensitive && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: -8 }}>
          <Icon name="lock" size={14} color={c.t2} /><T v="tiny">Only you can see this topic</T>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1, gap: 4 }}>
          <T v="tiny">Share of viewing</T>
          <T v="stat">{Math.round(d.shareFrom)}% → {Math.round(d.shareTo)}%</T>
          <T v="tiny">{sameMonth ? monthLong(d.toMonth, true) : `${monthLong(d.fromMonth)} to ${monthLong(d.toMonth)}`}</T>
        </Card>
        <Card style={{ flex: 1, gap: 4 }}>
          <T v="tiny">Served to you</T>
          <T v="stat" color={c.accentT}>{Math.round(d.servedPct)}%</T>
          <T v="tiny">not from your searches or follows</T>
        </Card>
      </View>

      <H2>Where it came from</H2>
      {sources.length === 0 ? (
        <T v="small">No clear sources yet.</T>
      ) : (
        <List>
          {sources.map((s, i) => (
            <Row key={`${s.platform}-${s.name}-${i}`}>
              <Grow title={s.name} detail={`${PLATFORM_LABEL[s.platform]}, ${num(s.count)} ${unit(s.platform, s.count)}${s.subscribed ? ', subscribed' : ''}`} />
              <Tag kind={s.origin === 'served' ? 'served' : 'chosen'}>{s.origin === 'served' ? 'Served' : 'Chosen'}</Tag>
            </Row>
          ))}
        </List>
      )}

      {showItems && (
        <List>
          {d.recentItems.length === 0 ? <Row><T v="small">No individual items saved for this topic.</T></Row> : null}
          {d.recentItems.map((it, i) => {
            const title = it.title || (it.platform === 'tiktok' ? 'TikTok video (no title in export)' : 'Untitled');
            return (
              <Row key={i} onPress={it.url ? () => { Linking.openURL(it.url!).catch(() => {}); } : undefined} label={it.url ? `${title}, opens in your browser` : undefined}>
                <Grow title={title} detail={`${PLATFORM_LABEL[it.platform]}, ${dateShort(it.time)}`} />
                <OriginTag origin={it.origin} />
              </Row>
            );
          })}
        </List>
      )}

      {showTip && platform && <Note>{FEWER_TIP[platform]}</Note>}

      {actionPlatforms.length > 0 && (
        <>
          <H2>Take action</H2>
          <T v="small" style={{ marginTop: -4 }}>Official help for tuning your recommendations or starting over. Opens on the platform’s site.</T>
          {actionPlatforms.map((p) => (
            <View key={p} style={{ gap: 8 }}>
              {actionPlatforms.length > 1 && <GroupLabel>{PLATFORM_LABEL[p]}</GroupLabel>}
              <List>{RECOMMENDATION_ACTIONS[p]!.map((l) => <ExternalRow key={l.href} {...l} />)}</List>
            </View>
          ))}
        </>
      )}

      <Bottom>
        {platform && <Btn onPress={() => setShowTip((v) => !v)}>{`See fewer of these on ${PLATFORM_LABEL[platform]}`}</Btn>}
        <Btn kind="secondary" onPress={() => setShowItems((v) => !v)}>
          {showItems ? 'Hide the videos' : `Show the videos${d.itemCount ? ` (${num(d.itemCount)})` : ''}`}
        </Btn>
        {showItems && d.recentItems.length > 0 && d.itemCount > d.recentItems.length && (
          <T v="tiny" style={{ textAlign: 'center' }}>Showing the {d.recentItems.length} most recent of {num(d.itemCount)}.</T>
        )}
      </Bottom>
    </Screen>
  );
}

