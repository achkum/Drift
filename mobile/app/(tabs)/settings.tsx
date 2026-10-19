import { useState } from 'react';
import { useRouter } from 'expo-router';
import { QLOG } from '@/lib/sample/household';
import { plural } from '@/lib/ui/format';
import { useDrift } from '../../src/data/useDrift';
import { Grow, GroupLabel, H1, List, Outline, Row, Screen, Seg, SwitchRow, T, useToast } from '../../src/ui/kit';
import { setOnboarded, useTheme, type ThemePref } from '../../src/ui/theme';

const THEMES: { value: ThemePref; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

export default function Settings() {
  const { pref, setPref, isDark } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { imports, insights, isSample, status } = useDrift();
  const [digest, setDigest] = useState(true);
  const [alerts, setAlerts] = useState(true);

  const themeNote = pref === 'system' ? `Following your device: ${isDark ? 'dark' : 'light'}` : pref === 'dark' ? 'Always dark' : 'Always light';
  const platformCount = isSample ? new Set(imports.map((i) => i.platform)).size : insights.platforms.length;
  const connectedDetail = status !== 'ready' ? ' ' : platformCount ? `${plural(platformCount, 'platform')} imported` : 'Nothing imported yet';

  return (
    <Screen tabbed>
      <H1>Settings</H1>

      <GroupLabel>Appearance</GroupLabel>
      <Outline>
        <Seg label="Theme" options={THEMES} value={pref} onChange={setPref} />
        <T v="tiny" accessibilityLiveRegion="polite">{themeNote}</T>
      </Outline>

      <GroupLabel>Data</GroupLabel>
      <List>
        <Row href="/connect" chev><Grow title="Connected platforms" detail={connectedDetail} /></Row>
        <Row href="/settings/data" chev><Grow title="Data and privacy" detail="Smarter topics, title lookup, storage, delete" /></Row>
        <Row href="/ads" chev><Grow title="Who targets you" detail="Advertisers, ad tricks and ad settings" /></Row>
      </List>

      <GroupLabel>Household</GroupLabel>
      <List>
        <Row href="/household" chev><Grow title="Members" detail="Not in a household yet" /></Row>
        <Row href="/household/sharing" chev><Grow title="What you share" detail="Preview" /></Row>
        <Row href="/settings/questions" chev><Grow title="Questions about you" detail={`Preview, ${QLOG.length} sample questions`} /></Row>
      </List>

      <GroupLabel>Notifications</GroupLabel>
      <List>
        <SwitchRow title="Weekly digest" detail="Sundays" checked={digest} onChange={setDigest} />
        <SwitchRow title="Safety alerts" detail="Sharp shifts toward harmful topics" checked={alerts} onChange={setAlerts} />
      </List>

      <GroupLabel>About</GroupLabel>
      <List>
        <Row onPress={() => toast('Help centre opens here.')} chev><Grow title="Help" /></Row>
        <Row onPress={() => { setOnboarded(false); router.replace('/onboarding/welcome'); }} chev><Grow title="Replay onboarding" /></Row>
      </List>
    </Screen>
  );
}
