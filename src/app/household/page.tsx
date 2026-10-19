import type { Metadata } from 'next';
import { HouseholdScreen } from '@/components/screens/Household';

export const metadata: Metadata = { title: 'Household' };

type Search = Promise<{ preview?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const preview = (await searchParams).preview === '1';
  return <HouseholdScreen key={preview ? 'preview' : 'live'} preview={preview} />;
}
