import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MemberScreen } from '@/components/screens/Member';
import { LiveMemberScreen, LivePreviewScreen } from '@/components/screens/HouseholdLive';
import { MEMBERS, VIEWER_NAMES, isMemberKey, type Viewer } from '@/lib/sample/household';

type Params = Promise<{ member: string }>;
type Search = Promise<{ preview?: string | string[]; as?: string | string[] }>;

function viewerOf(v: string | string[] | undefined): Viewer | undefined {
  return v === 'sam' || v === 'maya' ? v : undefined;
}

/** Real member ids are base64url SHA-256 hashes. */
const MEMBER_ID = /^[A-Za-z0-9_-]{43}$/;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { member } = await params;
  const sp = await searchParams;
  if (member === 'you' && typeof sp.as === 'string') return { title: 'What they see' };
  const preview = viewerOf(sp.preview);
  if (!isMemberKey(member)) return { title: 'Household' };
  return { title: preview ? `What ${VIEWER_NAMES[preview]} sees` : MEMBERS[member].displayName };
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { member } = await params;
  const sp = await searchParams;
  // Real: "Preview what X sees" (/household/you?as=<id>) and a member's view (/household/<id>).
  if (member === 'you' && typeof sp.as === 'string' && MEMBER_ID.test(sp.as)) return <LivePreviewScreen key={sp.as} memberId={sp.as} />;
  if (MEMBER_ID.test(member)) return <LiveMemberScreen key={member} memberId={member} />;
  // Sample people (Preview).
  if (!isMemberKey(member)) notFound();
  const preview = member === 'you' ? viewerOf(sp.preview) ?? 'sam' : undefined;
  return <MemberScreen key={`${member}-${preview ?? ''}`} memberKey={member} preview={preview} />;
}
