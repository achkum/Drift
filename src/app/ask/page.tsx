import type { Metadata } from 'next';
import { AskScreen } from '@/components/screens/Ask';
import { isAskKey } from '@/lib/sample/household';

type Search = Promise<{ about?: string | string[] }>;

export const metadata: Metadata = { title: 'Ask Drift' };

export default async function Page({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).about;
  const about = typeof raw === 'string' && isAskKey(raw) ? raw : 'you';
  return <AskScreen key={about} about={about} />;
}
