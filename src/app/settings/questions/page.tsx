import type { Metadata } from 'next';
import { QuestionsScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: 'Questions about you' };

type Search = Promise<{ preview?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const preview = (await searchParams).preview === '1';
  return <QuestionsScreen key={preview ? 'preview' : 'live'} preview={preview} />;
}
