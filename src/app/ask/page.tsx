import type { Metadata } from 'next';
import { AskScreen } from '@/components/screens/Ask';
import { isAskKey } from '@/lib/sample/household';

type Search = Promise<{ about?: string | string[]; preview?: string | string[] }>;

export const metadata: Metadata = { title: 'Ask Drift' };

/** Real member ids are base64url SHA-256 hashes. */
const MEMBER_ID = /^[A-Za-z0-9_-]{43}$/;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const raw = sp.about;
  const about = typeof raw === 'string' && (isAskKey(raw) || MEMBER_ID.test(raw)) ? raw : 'you';
  const preview = sp.preview === '1';
  return <AskScreen key={`${about}-${preview}`} about={about} preview={preview} />;
}
