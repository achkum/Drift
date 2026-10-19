import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Logo } from '../../src/ui/Icon';
import { Btn, Screen, T, useToast } from '../../src/ui/kit';
import { setOnboarded } from '../../src/ui/theme';

export default function Welcome() {
  const router = useRouter();
  const toast = useToast();
  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 280 }}>
        <Logo />
        <T v="h1" accessibilityRole="header" style={{ fontSize: 36, lineHeight: 42, letterSpacing: -0.8 }}>Drift</T>
        <T v="sub" style={{ textAlign: 'center', maxWidth: 300 }}>See how your feeds drift: what platforms serve you versus what you choose.</T>
      </View>
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <Btn onPress={() => router.push('/onboarding/who')}>Get started</Btn>
        <Btn kind="secondary" onPress={() => { setOnboarded(true); router.replace('/home'); }}>I’ve used Drift before</Btn>
        <T v="tiny" style={{ textAlign: 'center' }}>
          No account needed. Your history is read on this phone and never uploaded. By continuing you agree to the{' '}
          <T v="tiny" w={700} accessibilityRole="link" onPress={() => toast('Terms open here.')}>Terms</T>
          {' and '}
          <T v="tiny" w={700} accessibilityRole="link" onPress={() => toast('Privacy Policy opens here.')}>Privacy Policy</T>.
        </T>
      </View>
    </Screen>
  );
}
