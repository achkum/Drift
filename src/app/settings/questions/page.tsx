import type { Metadata } from 'next';
import { QuestionsScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: "Questions about you" };

export default function Page() {
  return <QuestionsScreen />;
}
