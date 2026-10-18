import type { Metadata } from 'next';
import { AlertScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: "Safety alert" };

export default function Page() {
  return <AlertScreen />;
}
