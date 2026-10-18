import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/screens/Settings';

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsScreen />;
}
