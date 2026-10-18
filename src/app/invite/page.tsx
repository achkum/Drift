import type { Metadata } from 'next';
import { InviteScreen } from '@/components/screens/HouseholdMore';

export const metadata: Metadata = { title: "Invite" };

export default function Page() {
  return <InviteScreen />;
}
