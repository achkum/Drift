import { useState } from 'react';
import { VIEWER_NAMES, type ShareFlagsWithSensitive, type Viewer } from '@/lib/sample/household';
import { Bottom, Btn, H1, List, Note, PreviewTag, Screen, Seg, SwitchRow, T } from '../../src/ui/kit';
import { setShare, useShare } from '../../src/ui/sample';

const ROWS: { cat: keyof ShareFlagsWithSensitive; title: string; detail: string }[] = [
  { cat: 'trends', title: 'Topic trends', detail: 'Your main topics, month by month' },
  { cat: 'sources', title: 'Where topics come from', detail: 'Chosen vs served, and the channels behind topics' },
  { cat: 'ads', title: 'Ads and interest lists', detail: 'Who targets you, and what each platform thinks you like' },
  { cat: 'ai', title: 'Questions to Drift', detail: 'They can ask Drift about your data. You see every question.' },
  { cat: 'sens', title: 'Sensitive topics', detail: 'Political lean, health and similar. Off unless you turn it on.' },
];

export default function Sharing() {
  const share = useShare();
  const [who, setWho] = useState<Viewer>('sam');
  const name = VIEWER_NAMES[who];
  return (
    <Screen back="/household">
      <H1>What you share</H1>
      <T v="small" style={{ marginTop: -6 }}><PreviewTag />Choose what each person can see.</T>
      <Seg<Viewer>
        label="Choose person"
        options={(['sam', 'maya'] as Viewer[]).map((v) => ({ value: v, label: `With ${VIEWER_NAMES[v]}` }))}
        value={who}
        onChange={setWho}
      />
      <List>
        {ROWS.map((r) => (
          <SwitchRow key={r.cat} title={r.title} detail={r.detail} checked={share[who][r.cat]} onChange={(v) => setShare(who, r.cat, v)} />
        ))}
      </List>
      <Note icon="lock" tone="card">Never shared: your messages and individual videos or searches. Drift’s answers only use summaries.</Note>
      <Bottom>
        <Btn href={`/household/you?preview=${who}`}>{`Preview what ${name} sees`}</Btn>
        <T v="tiny" style={{ textAlign: 'center' }}>Sample screen. Nothing is shared and no one is invited.</T>
      </Bottom>
    </Screen>
  );
}
