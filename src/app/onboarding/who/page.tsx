import type { Metadata } from 'next';
import { WhoScreen } from '@/components/screens/Onboarding';

export const metadata: Metadata = { title: "Who it’s for" };

export default function Page() {
  return <WhoScreen />;
}
