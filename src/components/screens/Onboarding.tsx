'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '../Icon';
import { Screen, StepProgress, PageTitle } from '../Screen';
import { Choice } from '../controls';
import { useToast } from '../Toast';
import { isOnboarded, setAudience, setOnboarded, useAudience } from '@/lib/ui/prefs';

export function WelcomeScreen() {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (isOnboarded()) router.replace('/home');
  }, [router]);

  // v1 has no accounts: every sign-in option simply continues to onboarding.
  const start = () => router.push('/onboarding/who');
  const logIn = () => { setOnboarded(true); router.push('/home'); };

  return (
    <main className="screen welcome-gate">
      <div className="welcome-hero">
        <Logo />
        <PageTitle>Drift</PageTitle>
      </div>
      <div className="welcome-actions">
        <button type="button" className="btn" onClick={start}>Continue with Apple</button>
        <button type="button" className="btn btn-line btn-lg" onClick={start}>Continue with Google</button>
        <button type="button" className="btn btn-2 btn-lg" onClick={start}>Continue with email</button>
        <div className="login-line">Already have an account? <button type="button" onClick={logIn}>Log in</button></div>
        <p className="legal">
          By continuing you agree to the{' '}
          <button type="button" onClick={() => toast('Terms open here.')}>Terms</button> and{' '}
          <button type="button" onClick={() => toast('Privacy Policy opens here.')}>Privacy Policy</button>.
        </p>
      </div>
    </main>
  );
}

export function WhoScreen() {
  const audience = useAudience();
  return (
    <Screen back="/" right={<span className="step">Step 1 of 3</span>} beforeScroll={<StepProgress step={1} />} scrollClassName="ob">
      <PageTitle>Who is this for?</PageTitle>
      <p className="sub lead">You can add people later.</p>
      <fieldset className="fieldset" style={{ marginTop: 6 }}>
        <legend className="sr-only">Account type</legend>
        <Choice name="kind" title="Just me" detail="Insights on your own feeds. Everything stays private." checked={audience === 'me'} onChange={() => setAudience('me')} />
        <Choice name="kind" title="My household" detail="Add a partner or teens aged 13–17. Each person has their own account and chooses what to share." checked={audience === 'household'} onChange={() => setAudience('household')} />
      </fieldset>
      <div className="bottom"><Link href="/onboarding/privacy" className="btn">Continue</Link></div>
    </Screen>
  );
}
