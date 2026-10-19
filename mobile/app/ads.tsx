import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { AdTactic } from '@/lib/types';
import { AD_ACTIONS, erasureRequest, tacticExplanation } from '@/lib/ui/actions';
import { joinAnd, num, PLATFORM_LABEL, plural } from '@/lib/ui/format';
import { useDrift } from '../src/data/useDrift';
import { mergeAdvertisers } from '../src/ui/derive';
import {
  Btn, Card, Disclosure, EmptyState, ExternalRow, Grow, GroupLabel, H1, H2, List, Loading, Note, Outline, Row, SampleBanner,
  Screen, Sheet, Split, T, useToast,
} from '../src/ui/kit';
import { FONT, useTheme } from '../src/ui/theme';

const SHOW_FIRST = 8;

function TacticCard({ t }: { t: AdTactic }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ gap: 8 }}>
      <Split><T v="b16" style={{ flex: 1 }}>{t.label}</T><T w={700} style={{ fontSize: 15 }}>{plural(t.count, 'ad')}</T></Split>
      <T v="small">{tacticExplanation(t)}</T>
      {t.examples.length > 0 && (
        <>
          <Disclosure open={open} onPress={() => setOpen((v) => !v)}>
            {open ? 'Hide examples' : `Show ${t.examples.length === 1 ? 'an example' : `${t.examples.length} examples`}`}
          </Disclosure>
          {open && (
            <View style={{ gap: 6 }} accessibilityLabel={`Examples of ${t.label}`}>
              {t.examples.map((ex, i) => (
                <View key={i} style={{ padding: 12, borderRadius: 12, backgroundColor: c.bg }}>
                  <T style={{ fontSize: 14, lineHeight: 20 }}>“{ex}”</T>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

function RequestSheet({ open, onClose, advertisers }: { open: boolean; onClose(): void; advertisers: string[] }) {
  const { c } = useTheme();
  const toast = useToast();
  const [company, setCompany] = useState('');
  const [other, setOther] = useState('');
  const [picking, setPicking] = useState(false);
  const name = company === '__other' ? other : company;
  const text = useMemo(() => erasureRequest(name), [name]);

  async function copy() {
    try {
      await Clipboard.setStringAsync(text);
      toast('Copied. Paste it into an email to the company’s privacy contact.');
    } catch {
      toast('Couldn’t copy. Press and hold the text to select it.');
    }
  }

  const options = [...advertisers.map((a) => ({ value: a, label: a })), { value: '__other', label: 'Another company' }];
  const shown = company === '__other' ? 'Another company' : company || 'Choose an advertiser';

  return (
    <Sheet open={open} onClose={onClose} title="Ask an advertiser to delete your data">
      <T v="small">
        Under GDPR Article 17 you can ask any company to erase the data it holds about you. Drift doesn’t send anything:
        copy this letter, fill in the brackets, and email it to the company’s privacy or data protection contact (usually in its privacy policy).
      </T>
      <View style={{ gap: 6 }}>
        <T v="b15">Company</T>
        <Btn kind="secondary" onPress={() => setPicking((v) => !v)} label={`Company: ${shown}. Change`}>{shown}</Btn>
        {picking && (
          <List>
            {options.map((o) => (
              <Row key={o.value} onPress={() => { setCompany(o.value); setPicking(false); }} label={o.label}>
                <T v="b15" style={{ flex: 1 }}>{o.label}</T>
              </Row>
            ))}
          </List>
        )}
      </View>
      {company === '__other' && (
        <View style={{ gap: 6 }}>
          <T v="b15">Company name</T>
          <TextInput
            value={other}
            onChangeText={setOther}
            accessibilityLabel="Company name"
            autoComplete="organization"
            placeholderTextColor={c.t3}
            style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 12, fontFamily: FONT[400], fontSize: 16, color: c.t1 }}
          />
        </View>
      )}
      <View style={{ gap: 6 }}>
        <T v="b15">Your request</T>
        <TextInput
          value={text}
          multiline
          editable={false}
          accessibilityLabel="Your request"
          style={{ minHeight: 220, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14, fontFamily: FONT[400], fontSize: 14, lineHeight: 21, color: c.t1, textAlignVertical: 'top' }}
        />
      </View>
      <Btn onPress={copy}>Copy the request</Btn>
      <Btn kind="secondary" onPress={onClose}>Close</Btn>
    </Sheet>
  );
}

export default function Ads() {
  const { insights, isSample, status } = useDrift();
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState(false);
  const ads = insights.ads;
  const advertisers = useMemo(() => mergeAdvertisers(ads.advertisers), [ads.advertisers]);
  const imported = new Set(insights.platforms.map((p) => p.platform));
  const actions = [...AD_ACTIONS].sort((a, b) => Number(b.platforms.some((p) => imported.has(p))) - Number(a.platforms.some((p) => imported.has(p))));
  const shown = showAll ? advertisers : advertisers.slice(0, SHOW_FIRST);
  const tacticAds = ads.trickyAdItems ?? Math.max(0, ...ads.tactics.map((t) => t.count));

  if (status !== 'ready') {
    return <Screen back="/home"><H1>Who targets you</H1><Loading blocks={[20, 168, 120, 200]} /></Screen>;
  }

  const summary = advertisers.length || ads.adItems
    ? [
        ads.adItems ? `${plural(ads.adItems, 'ad')} in your exports` : null,
        advertisers.length ? `${plural(advertisers.length, 'advertiser')} named` : null,
      ].filter(Boolean).join(', ') + '.'
    : 'Your exports don’t list any ads or advertisers yet.';

  return (
    <Screen back="/home">
      <H1>Who targets you</H1>
      <T v="sub" style={{ marginTop: -6 }}>{summary}</T>
      {isSample && <SampleBanner />}

      <H2>Advertisers</H2>
      {advertisers.length === 0 ? (
        <EmptyState title="No advertisers found">
          Instagram exports list advertisers who used your activity or uploaded a list with your details. YouTube and TikTok exports don’t.
        </EmptyState>
      ) : (
        <>
          <List>
            {shown.map((a) => (
              <Row key={a.name}>
                <Grow
                  title={a.name}
                  detail={`${joinAnd(a.platforms.map((p) => PLATFORM_LABEL[p]))}${typeof a.count === 'number' ? '' : ', holds your data'}`}
                />
                {typeof a.count === 'number' && <T w={700} style={{ fontSize: 15 }}>{plural(a.count, 'ad')}</T>}
              </Row>
            ))}
          </List>
          {advertisers.some((a) => typeof a.count !== 'number') && (
            <T v="tiny">“Holds your data” means the platform says this advertiser used your activity or a list with your details to reach you.</T>
          )}
          {advertisers.length > SHOW_FIRST && (
            <Btn kind="secondary" onPress={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${num(advertisers.length)}`}</Btn>
          )}
        </>
      )}

      <H2>Ad tricks</H2>
      {ads.tactics.length === 0 ? (
        <Note>
          {ads.adItems
            ? 'Drift didn’t spot common pressure tricks in the ad titles it could read.'
            : 'No ad titles in your exports yet, so Drift can’t check them for tricks. YouTube marks videos that came from ads.'}
        </Note>
      ) : (
        <>
          <T v="small" style={{ marginTop: -4 }}>Drift read the titles of your ads and found {plural(tacticAds, 'ad')} using pressure tricks.</T>
          {ads.tactics.map((t) => <TacticCard key={t.id} t={t} />)}
        </>
      )}

      <H2>Take action</H2>
      <T v="small" style={{ marginTop: -4 }}>Official settings on each platform. They open in your browser, on the platform’s own site.</T>
      {actions.map((g) => (
        <View key={g.id} style={{ gap: 8 }}>
          <GroupLabel>{g.label}</GroupLabel>
          <List>{g.links.map((l) => <ExternalRow key={l.href} {...l} />)}</List>
        </View>
      ))}

      <Outline style={{ marginTop: 4 }}>
        <T v="b16">Ask an advertiser to delete your data</T>
        <T v="small">A ready-to-send request under GDPR Article 17. You copy it and send it yourself.</T>
        <Btn kind="line" onPress={() => setSheet(true)}>Write the request</Btn>
      </Outline>

      <RequestSheet open={sheet} onClose={() => setSheet(false)} advertisers={advertisers.map((a) => a.name)} />
    </Screen>
  );
}
