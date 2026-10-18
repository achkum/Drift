import type { Metadata } from 'next';
import { SharingScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: "What you share" };

export default function Page() {
  return <SharingScreen />;
}
