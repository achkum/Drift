import type { Metadata } from 'next';
import { AdsScreen } from '@/components/screens/Ads';

export const metadata: Metadata = { title: 'Who targets you' };

export default function Page() {
  return <AdsScreen />;
}
