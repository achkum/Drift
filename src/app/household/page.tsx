import type { Metadata } from 'next';
import { HouseholdScreen } from '@/components/screens/Household';

export const metadata: Metadata = { title: "Household" };

export default function Page() {
  return <HouseholdScreen />;
}
