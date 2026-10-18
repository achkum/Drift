import type { Metadata } from 'next';
import { ConnectScreen } from '@/components/screens/Connect';

export const metadata: Metadata = { title: "Connect platforms" };

export default function Page() {
  return <ConnectScreen />;
}
