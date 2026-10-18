import type { Metadata } from 'next';
import { PrivacyScreen } from '@/components/screens/Privacy';

export const metadata: Metadata = { title: "Privacy promise" };

export default function Page() {
  return <PrivacyScreen />;
}
