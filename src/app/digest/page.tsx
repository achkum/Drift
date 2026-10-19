import type { Metadata } from 'next';
import { DigestScreen } from '@/components/screens/Digest';

export const metadata: Metadata = { title: 'Weekly digest' };

export default function Page() {
  return <DigestScreen />;
}
