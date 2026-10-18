import type { Metadata } from 'next';
import { ChosenScreen } from '@/components/screens/Chosen';

export const metadata: Metadata = { title: "Chosen vs served" };

export default function Page() {
  return <ChosenScreen />;
}
