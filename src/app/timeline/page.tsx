import type { Metadata } from 'next';
import { TimelineScreen } from '@/components/screens/Timeline';

export const metadata: Metadata = { title: "Interest timeline" };

export default function Page() {
  return <TimelineScreen />;
}
