import type { Metadata } from 'next';
import { JoinScreen } from '@/components/screens/Join';

export const metadata: Metadata = { title: 'Join a household', referrer: 'no-referrer' };

export default function Page() {
  return <JoinScreen />;
}
