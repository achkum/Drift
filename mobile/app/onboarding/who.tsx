import { useState } from 'react';
import { View } from 'react-native';
import { kvGet, kvSet } from '../../src/ui/kv';
import { Bottom, Btn, Choice, H1, Screen, T } from '../../src/ui/kit';
import { StepLabel, StepProgress } from '../../src/ui/onboarding';

export default function Who() {
  const [aud, setAud] = useState<'me' | 'household'>(() => (kvGet('drift.audience') === 'household' ? 'household' : 'me'));
  const pick = (a: 'me' | 'household') => { setAud(a); kvSet('drift.audience', a); };
  return (
    <Screen back="/onboarding/welcome" right={<StepLabel step={1} />} contentStyle={{ paddingTop: 28 }}>
      <View style={{ marginHorizontal: -20, marginTop: -28, marginBottom: 12 }}><StepProgress step={1} /></View>
      <H1>Who is this for?</H1>
      <T v="sub" style={{ marginTop: -6 }}>You can add people later.</T>
      <View accessibilityRole="radiogroup" style={{ gap: 12, marginTop: 6 }}>
        <Choice title="Just me" detail="Insights on your own feeds. Everything stays private." checked={aud === 'me'} onPress={() => pick('me')} />
        <Choice title="My household" detail="Add a partner or teens aged 13–17. Each person has their own account and chooses what to share." checked={aud === 'household'} onPress={() => pick('household')} />
      </View>
      <Bottom><Btn href="/onboarding/privacy">Continue</Btn></Bottom>
    </Screen>
  );
}
