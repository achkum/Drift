import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MemberScreen } from '@/components/screens/Member';
import { MEMBERS, VIEWER_NAMES, isMemberKey, type Viewer } from '@/lib/sample/household';

type Params = Promise<{ member: string }>;
type Search = Promise<{ preview?: string | string[] }>;

function viewerOf(v: string | string[] | undefined): Viewer | undefined {
  return v === 'sam' || v === 'maya' ? v : undefined;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { member } = await params;
  const preview = viewerOf((await searchParams).preview);
  if (!isMemberKey(member)) return { title: 'Household' };
  return { title: preview ? `What ${VIEWER_NAMES[preview]} sees` : MEMBERS[member].displayName };
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { member } = await params;
  if (!isMemberKey(member)) notFound();
  const preview = member === 'you' ? viewerOf((await searchParams).preview) ?? 'sam' : undefined;
  return <MemberScreen key={`${member}-${preview ?? ''}`} memberKey={member} preview={preview} />;
}
