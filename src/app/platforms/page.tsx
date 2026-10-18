import type { Metadata } from 'next';
import { PlatformsScreen } from '@/components/screens/Platforms';

export const metadata: Metadata = { title: "How platforms see you" };

export default function Page() {
  return <PlatformsScreen />;
}
