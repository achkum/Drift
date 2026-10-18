import type { Metadata } from 'next';
import { HomeScreen } from '@/components/screens/Home';

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <HomeScreen />;
}
