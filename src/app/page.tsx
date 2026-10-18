import type { Metadata } from 'next';
import { WelcomeScreen } from '@/components/screens/Onboarding';

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return <WelcomeScreen />;
}
