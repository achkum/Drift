import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  isMemberKey, MEMBERS, MEMBER_LABELS, VIEWER_NAMES, type CmpRowData, type Member, type ShareCategory, type Viewer,
} from '@/lib/sample/household';
import { Icon } from '../../src/ui/Icon';
import {
  Avatar, B, Btn, Card, ChosenSummary, EmptyState, Grow, H1, H2, KV, List, Note, Outline, PlatformChosen, PreviewTag, Row, Screen, Seg, T, Tag, useToast,
} from '../../src/ui/kit';
import { LineChart } from '../../src/ui/LineChart';
import { CmpRow, tok, useShare } from '../../src/ui/sample';
import { useTheme } from '../../src/ui/theme';

type Panel = 'trends' | 'sources' | 'ads' | 'compare';
const NEED: Record<Panel, ShareCategory> = { trends: 'trends', sources: 'sources', ads: 'ads', compare: 'trends' };
const PANELS: { value: Panel; label: string }[] = [
  { value: 'trends', label: 'Trends' },
  { value: 'sources', label: 'Sources' },
  { value: 'ads', label: 'Ads' },
  { value: 'compare', label: 'Compare' },
];

function TrendsPanel({ m }: { m: Member }) {
  const { c } = useTheme();
  const rows = m.series
    .map((s) => ({ n: s.name, d: s.vals[s.vals.length - 1] - s.vals[0], now: s.vals[s.vals.length - 1], warn: s.warn }))
    .sort((a, b) => b.d - a.d);
  const desc = m.series.map((s) => `${s.name} from ${s.vals[0]}% to ${s.vals[s.vals.length - 1]}%`).join(', ');
  return (
    <>
      <Outline>
        <T v="b16">Topics, month by month</T>
        <LineChart
          labels={MEMBER_LABELS}
          series={m.series.map((s) => ({ key: s.name, name: s.name, values: s.vals, color: tok(c, s.color), dash: s.dash }))}
          ariaLabel={`Share of viewing by topic, May to October. ${desc}.`}
        />
      </Outline>
      <List>
        {rows.map((r) => (
          <Row key={r.n}>
            <Grow title={r.n} detail={`Now ${r.now}% of viewing`} />
            <T w={700} color={r.warn ? c.amber : r.d > 0 ? c.accentT : c.t2}>{r.d > 0 ? '+' : '−'}{Math.abs(r.d)} pts</T>
          </Row>
        ))}
      </List>
      <Card>
        <T v="b16">What changed</T>
        {m.changes.map((ch) => <T key={ch} style={{ fontSize: 15, lineHeight: 22 }}>{ch}</T>)}
      </Card>
    </>
  );
}

function SourcesPanel({ m }: { m: Member }) {
  return (
    <>
      <ChosenSummary chosenPct={m.chosen}>
        <T v="small">Chosen means it followed a search, a follow or a subscription. Served is everything the platform put in front of {m.key === 'you' ? 'you' : 'them'}.</T>
      </ChosenSummary>
      <H2>By platform</H2>
      {m.platforms.map(([n, v]) => <PlatformChosen key={n} name={n} pct={v} />)}
      <H2>Where {m.srcTopic} came from</H2>
      <List>
        {m.srcRows.map(([name, detail, kind]) => (
          <Row key={name}>
            <Grow title={name} detail={detail} />
            <Tag kind={kind === 'served' ? 'served' : 'chosen'}>{kind === 'served' ? 'Served' : 'Chosen'}</Tag>
          </Row>
        ))}
      </List>
    </>
  );
}

function AdsPanel({ m }: { m: Member }) {
  const { c } = useTheme();
  const you = m.key === 'you';
  const who = you ? 'you' : m.first;
  const matches = m.ig[1].filter(([, ok]) => ok).length;
  return (
    <>
      <H2>Who targets {who}</H2>
      <List>
        {m.ads.map(([name, interest, n]) => (
          <Row key={name}>
            <Grow title={name} detail={`Used the interest ${interest}`} />
            <T w={700} style={{ fontSize: 15 }}>{n} ads</T>
          </Row>
        ))}
      </List>
      <Card>
        <T v="b16">Ad tricks seen</T>
        {m.tactics.map(([t, n]) => <KV key={t} left={t} right={n} />)}
      </Card>
      <Outline style={{ gap: 14 }}>
        <T v="b17">{m.ig[0]} thinks {who}{you ? '’re' : ' is'} into</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {m.ig[1].map(([name, ok]) => (
            <View key={name} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: ok ? c.accentS : c.surface }}>
              <T w={ok ? 700 : 400} color={ok ? c.accentT : c.t1} style={{ fontSize: 14 }}>{name}</T>
            </View>
          ))}
        </View>
        <T v="small"><B color={c.accentT}>{matches} of {m.ig[1].length}</B> match what {who} actually watch{you ? '' : 'es'}. The rest come from ads and accounts never opened.</T>
      </Outline>
    </>
  );
}

function ComparePanel({ m }: { m: Member }) {
  const you = m.key === 'you';
  return (
    <>
      <Outline style={{ gap: 18 }}>
        <T v="small">Share of viewing, last 30 days. Sample data.</T>
        {m.cmp.map((cg) => {
          const rows: CmpRowData[] = [{ n: m.first, v: cg.self, c: m.color }];
          if (!you && cg.you !== undefined) rows.push({ n: 'You', v: cg.you, c: 'var(--t1)' });
          rows.push({ n: m.driftLabel, s: 'Anonymous, opt-in', v: cg.drift, c: 'var(--muted-line)' });
          rows.push({ n: 'Published research', s: '[Report name, year]', v: cg.res, c: 'var(--muted-line)', k: 'r' });
          return (
            <View key={cg.t} style={{ gap: 10 }}>
              <T v="b15">{cg.t}</T>
              {rows.map((r) => <CmpRow key={r.n} r={r} />)}
            </View>
          );
        })}
      </Outline>
      <Card>
        <T v="b16">What stands out</T>
        <T v="small">{m.cmpNote}</T>
      </Card>
    </>
  );
}

export default function MemberScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const { member, preview } = useLocalSearchParams<{ member: string; preview?: string }>();
  const share = useShare();
  const [panel, setPanel] = useState<Panel>('trends');

  if (!member || !isMemberKey(member)) {
    return (
      <Screen back="/household">
        <H1>Person not found</H1>
        <EmptyState title="Nothing to show" action={{ href: '/household', label: 'Back to household' }}>This sample person doesn’t exist.</EmptyState>
      </Screen>
    );
  }

  const m = MEMBERS[member];
  const viewer: Viewer | undefined = preview === 'sam' || preview === 'maya' ? preview : undefined;
  const p = !!viewer;
  const viewerName = VIEWER_NAMES[viewer ?? 'sam'];
  const flags = viewer ? share[viewer] : m.shared;
  const ok = flags[NEED[panel]];
  const Body = { trends: TrendsPanel, sources: SourcesPanel, ads: AdsPanel, compare: ComparePanel }[panel];

  return (
    <Screen back={p ? '/household/sharing' : '/household'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar text={p ? 'You' : m.initial} kind={p ? 'you' : m.key === 'you' ? 'you' : m.key} size={52} />
        <View style={{ flex: 1 }}>
          <H1 style={{ fontSize: 26, lineHeight: 32 }}>{p ? `What ${viewerName} sees` : m.displayName}</H1>
          <T v="small"><PreviewTag />{p ? `Based on what you share with ${viewerName}` : m.sub}</T>
        </View>
      </View>

      {!p && m.alert && (
        <Card style={{ backgroundColor: c.amberS, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          onPress={() => toast('This is a preview of a teen safety alert.')} label="Feed shifting toward extreme dieting. Maya was told first, 2 days ago.">
          <Icon name="warn" size={22} color={c.amber} />
          <View style={{ flex: 1 }}>
            <T v="b15">Feed shifting toward extreme dieting</T>
            <T v="small">Maya was told first, 2 days ago.</T>
          </View>
        </Card>
      )}

      {!p && (m.shared.ai ? (
        <Btn href={`/ask?about=${m.key}`} icon="sparkle">{`Ask Drift about ${m.first}`}</Btn>
      ) : (
        <Btn kind="secondary" icon="sparkle" onPress={() => toast(`Request sent to ${m.first}. They choose whether to allow questions.`)}>{`${m.first} hasn’t allowed questions`}</Btn>
      ))}

      <Seg<Panel> label="Insight type" options={PANELS} value={panel} onChange={setPanel} />
      <View style={{ gap: 14 }}>
        {ok ? <Body m={m} /> : (
          <Card>
            <Icon name="lock" size={20} color={c.t2} />
            <T v="b16">{p ? `Not shared with ${viewerName}` : `${m.first} hasn’t shared this`}</T>
            <T v="small">{p ? `${viewerName} can’t see this. Turn it on in What you share.` : `${m.first} decides what you can see. You can ask, and they can say no.`}</T>
            {!p && <Btn kind="secondary" onPress={() => toast(`Request sent to ${m.first}. They choose whether to share.`)}>{`Ask ${m.first} to share`}</Btn>}
          </Card>
        )}
      </View>

      <Note icon="lock">
        Never shown: messages, and individual videos or searches. Sensitive topics such as political lean and health stay hidden unless {p ? 'you turn them on' : `${m.first} allows them`}.
      </Note>
      {!p && <T v="small" style={{ textAlign: 'center' }}>{m.first} can see exactly what you see on this page, and every question you ask.</T>}
    </Screen>
  );
}
