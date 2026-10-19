import type { Metadata } from 'next';
import { AlertScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: 'Safety alert' };

type Search = Promise<{ preview?: string | string[]; id?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const preview = sp.preview === '1';
  const id = typeof sp.id === 'string' ? sp.id : undefined;
  return <AlertScreen key={`${preview}-${id ?? ''}`} preview={preview} id={id} />;
}
