import { View } from 'react-native';
import { T } from './kit';
import { useTheme } from './theme';

export function StepProgress({ step }: { step: number }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`Step ${step} of 3`} style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
      {[1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.t1 : c.line }} />)}
    </View>
  );
}

export function StepLabel({ step }: { step: number }) {
  return <T v="small" style={{ paddingRight: 12 }}>Step {step} of 3</T>;
}
