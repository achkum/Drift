import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, useFonts } from '@expo-google-fonts/dm-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider, useReducedMotion } from '../src/ui/kit';
import { ThemeProvider, useTheme } from '../src/ui/theme';

function Shell() {
  const { c, isDark } = useTheme();
  const reduce = useReducedMotion();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: reduce ? 'none' : 'default' }} />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
