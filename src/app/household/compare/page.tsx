import type { Metadata } from 'next';
import { CompareScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: "Household compared" };

export default function Page() {
  return <CompareScreen />;
}
