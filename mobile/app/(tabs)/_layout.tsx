import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../src/ui/kit';
import { FONT, useTheme } from '../../src/ui/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
const TABS: { name: string; title: string; icon: FeatherName }[] = [
  { name: 'home', title: 'Home', icon: 'home' },
  { name: 'timeline', title: 'Timeline', icon: 'trending-up' },
  { name: 'household', title: 'Household', icon: 'users' },
  { name: 'settings', title: 'Settings', icon: 'settings' },
];

export default function TabsLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: reduce ? 'none' : 'fade',
        tabBarActiveTintColor: c.t1,
        tabBarInactiveTintColor: c.t2,
        tabBarLabelStyle: { fontFamily: FONT[500], fontSize: 12 },
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.line,
          borderTopWidth: 1,
          height: 72 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 10 + insets.bottom,
        },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ focused }) => <Feather name={t.icon} size={24} color={focused ? c.t1 : c.t2} />,
          }}
        />
      ))}
    </Tabs>
  );
}
