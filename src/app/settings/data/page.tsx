import type { Metadata } from 'next';
import { DataScreen } from '@/components/screens/DataPrivacy';

export const metadata: Metadata = { title: "Data and privacy" };

export default function Page() {
  return <DataScreen />;
}
