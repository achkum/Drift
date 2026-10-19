import type { Metadata } from 'next';
import { InviteScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: 'Invite' };

type Search = Promise<{ preview?: string | string[] }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const preview = (await searchParams).preview === '1';
  return <InviteScreen key={preview ? 'preview' : 'live'} preview={preview} />;
}
