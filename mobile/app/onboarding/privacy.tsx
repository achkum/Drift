import { View } from 'react-native';
import { Bottom, Btn, H1, Screen, T } from '../../src/ui/kit';
import { Icon, type IconName } from '../../src/ui/Icon';
import { StepLabel, StepProgress } from '../../src/ui/onboarding';
import { useTheme } from '../../src/ui/theme';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'phone', title: 'Analysed on this device', text: 'Your watch and search history is read here and never uploaded to us.' },
  { icon: 'people', title: 'You decide what to share', text: 'Nothing reaches household members unless you turn it on, topic by topic.' },
  { icon: 'lock', title: 'Sensitive topics stay private', text: 'Political, health and other sensitive insights are only ever shown to you.' },
  { icon: 'trash', title: 'Delete anytime', text: 'Remove everything in one step from Settings.' },
];

export default function Privacy() {
  const { c } = useTheme();
  return (
    <Screen back="/onboarding/who" right={<StepLabel step={2} />} contentStyle={{ paddingTop: 28, gap: 22 }}>
      <View style={{ marginHorizontal: -20, marginTop: -28 }}><StepProgress step={2} /></View>
      <H1>Your data stays on your device</H1>
      {FEATURES.map((f) => (
        <View key={f.title} style={{ flexDirection: 'row', gap: 16 }} accessible accessibilityLabel={`${f.title}. ${f.text}`}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.accentS, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={f.icon} color={c.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="b17">{f.title}</T>
            <T v="small">{f.text}</T>
          </View>
        </View>
      ))}
      <Bottom><Btn href="/onboarding/connect">I understand</Btn></Bottom>
    </Screen>
  );
}
