import type { Metadata } from 'next';
import { CompareScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: 'Household compared' };

type Search = Promise<{ preview?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const preview = (await searchParams).preview === '1';
  return <CompareScreen key={preview ? 'preview' : 'live'} preview={preview} />;
}
