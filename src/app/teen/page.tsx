import type { Metadata } from 'next';
import { TeenScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: "Teen consent" };

export default function Page() {
  return <TeenScreen />;
}
