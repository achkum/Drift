import Link from 'next/link';
import { PageTitle, Screen } from '@/components/Screen';

export default function NotFound() {
  return (
    <Screen back="/home">
      <PageTitle>Page not found</PageTitle>
      <p className="sub lead">This page doesn&rsquo;t exist in Drift.</p>
      <div className="bottom"><Link href="/home" className="btn">Go to Overview</Link></div>
    </Screen>
  );
}
