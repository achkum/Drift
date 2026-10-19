import type { Metadata } from 'next';
import { SharingScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: 'What you share' };

type Search = Promise<{ preview?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const preview = (await searchParams).preview === '1';
  return <SharingScreen key={preview ? 'preview' : 'live'} preview={preview} />;
}
