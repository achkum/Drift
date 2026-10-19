import { useState } from 'react';
import { View } from 'react-native';
import { CMP } from '@/lib/sample/household';
import { B, Btn, Card, H1, Outline, PreviewTag, Screen, Seg, T } from '../../src/ui/kit';
import { CmpRow } from '../../src/ui/sample';

type CmpKey = keyof typeof CMP;

export default function Compare() {
  const [topic, setTopic] = useState<CmpKey>('fitness');
  const c = CMP[topic];
  return (
    <Screen back="/household">
      <H1>Household compared</H1>
      <T v="small" style={{ marginTop: -6 }}><PreviewTag />Share of viewing in the last 30 days, next to other people.</T>
      <Seg<CmpKey>
        label="Topic"
        options={(Object.keys(CMP) as CmpKey[]).map((k) => ({ value: k, label: CMP[k].label }))}
        value={topic}
        onChange={setTopic}
      />
      <Outline style={{ gap: 14 }}>
        <T v="small">Share of viewing, last 30 days</T>
        {c.rows.map((r) => <CmpRow key={r.n} r={r} />)}
      </Outline>
      <Card>
        <T v="b16">What stands out</T>
        <T v="small">{c.note}</T>
      </Card>
      <Outline style={{ gap: 6 }}>
        <T v="b15">Where the comparisons come from</T>
        <T v="small"><B>Drift users:</B> anonymous, opt-in, grouped by age. Nobody can be identified.</T>
        <T v="small"><B>Published research:</B> dashed bars. Sources are placeholders for now: [Report name, year].</T>
        <T v="small">All numbers here are sample data.</T>
      </Outline>
      <View><Btn href="/ask?about=household">Ask Drift about the household</Btn></View>
    </Screen>
  );
}
