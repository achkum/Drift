'use client';
// /join#<token>.<ownerId>[&r=teen&n=Name] — joining a household from an invite link.
// The secret stays in the fragment, which browsers never send to the server.
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle, Screen } from '../Screen';
import { Icon } from '../Icon';
import { Choice } from '../controls';
import { Loading } from '../bits';
import { useHouseholdLive } from '../HouseholdProvider';
import { NO_TEEN_FLAGS, TeenConsentForm, type TeenFlags } from '../household/TeenConsent';
import type { InviteRole } from '@/lib/household';
import { firstName } from '@/lib/ui/useHousehold';

interface Parsed {
  fragment: string;
  ownerFingerprint: string;
  role: InviteRole | null;
  from: string;
}

/** Splits `#<fragment>&r=…&n=…` into the invite fragment and the display hints. */
export function parseJoinHash(hash: string): Parsed | null {
  const raw = hash.replace(/^#/, '');
  const [fragment, ...rest] = raw.split('&');
  const m = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(fragment ?? '');
  if (!m) return null;
  const hints = new URLSearchParams(rest.join('&'));
  const r = hints.get('r');
  const s = m[2].replace(/[-_]/g, '').toUpperCase().slice(0, 12);
  return {
    fragment,
    ownerFingerprint: `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`,
    role: r === 'teen' || r === 'adult' ? r : null,
    from: (hints.get('n') ?? '').trim().slice(0, 40),
  };
}

const ERRORS: Record<string, string> = {
  invite_expired: 'This invite has expired. Ask for a new link.',
  invite_used: 'This invite was already used. Each link works once, so ask for a new one.',
  invite_not_found: 'This invite was cancelled or doesn’t exist. Ask for a new link.',
  owner_mismatch: 'Drift couldn’t confirm who sent this invite, so you were not added. Ask for a new link and compare the code with them.',
  household_full: 'This household is full. A household has at most 6 people.',
  bad_invite: 'This invite link is not complete. Copy the whole link, including the part after #.',
  already_member: 'You are already in a household on this device. Leave it in Settings first.',
  offline: 'Drift couldn’t connect. Check your connection and try again.',
  consent_required: 'A teen joins only after choosing on the consent screen.',
  unavailable: 'This browser can’t store household keys (private mode?). Try a normal window.',
};

function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'role_mismatch') return `${(e as Error).message} Ask the person who invited you to send the right kind of invite.`;
  return (code && ERRORS[code]) || (e instanceof Error && e.message) || 'Something went wrong. Try again.';
}

type Step = 'details' | 'consent' | 'joining' | 'done';

export function JoinScreen() {
  const hh = useHouseholdLive();
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null | undefined>(undefined);
  const [role, setRole] = useState<InviteRole | null>(null);
  const [name, setName] = useState('');
  const [flags, setFlags] = useState<TeenFlags>(NO_TEEN_FLAGS);
  const [step, setStep] = useState<Step>('details');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const p = parseJoinHash(window.location.hash);
      setParsed(p);
      if (p?.role) setRole(p.role);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (!name && hh.me?.displayName) setName(hh.me.displayName);
  }, [hh.me?.displayName, name]);

  const from = parsed?.from || 'Someone';
  const parent = parsed?.from ? firstName(parsed.from) : 'your parent';

  async function join(consent: boolean) {
    if (!parsed || !role) return;
    setStep('joining');
    setError(null);
    try {
      const { joinWithInvite } = await import('@/lib/household');
      await joinWithInvite(parsed.fragment, name.trim(), role, role === 'teen' ? { consent, share: flags } : undefined);
      // The secret is spent: take it out of the address bar and history.
      window.history.replaceState(null, '', '/join');
      await hh.refresh();
      setStep('done');
    } catch (e) {
      setError(errorText(e));
      setStep(role === 'teen' ? 'consent' : 'details');
    }
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !role) return;
    if (role === 'teen') setStep('consent');
    else void join(false);
  }

  if (step === 'done') {
    const owner = hh.members.find((m) => m.isOwner);
    return (
      <Screen back="/household" closeButton>
        <PageTitle>You joined {hh.me?.household?.name ?? 'the household'}</PageTitle>
        <div className="card note">
          <Icon name="check" />
          <span className="small">Verified: this invite came from <b className="t1">{owner?.displayName || from}</b>, code {parsed?.ownerFingerprint}. Drift checked their keys against the link.</span>
        </div>
        <p className="small">{role === 'teen'
          ? 'You chose what to share. You can see exactly what your parent sees, and every question they ask, in Settings.'
          : 'Nothing is shared until you turn it on in What you share.'}</p>
        <div className="bottom">
          <Link href="/household" className="btn">Go to household</Link>
          <Link href="/sharing" className="btn btn-2">What you share</Link>
        </div>
      </Screen>
    );
  }

  if (step === 'consent' || (step === 'joining' && role === 'teen')) {
    return (
      <Screen back="/household" right={<span className="tag tag-plain" style={{ marginRight: 12 }}>On your phone</span>}>
        <PageTitle>Choose what {parent} can see</PageTitle>
        <p className="sub lead">{parsed?.from ? firstName(parsed.from) : 'Your parent'} invited you to their household. You decide what to share, and you can change it anytime.</p>
        <TeenConsentForm flags={flags} onChange={setFlags} parent={parent} />
        {error && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="bottom">
          <button type="button" className="btn" disabled={step === 'joining'} onClick={() => join(true)}>
            {step === 'joining' ? 'Joining…' : 'Save my choices'}
          </button>
          <span className="tiny" style={{ textAlign: 'center' }}>Saving means you agree to join. You can leave at any time in Settings.</span>
          <button type="button" className="btn btn-2" disabled={step === 'joining'} onClick={() => router.push('/home')}>Not now</button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen back="/household" closeButton>
      <PageTitle>Join a household</PageTitle>
      {parsed === undefined || hh.status === 'loading' ? <Loading blocks={[64, 120, 56]} /> : parsed === null ? (
        <div className="card">
          <b className="b16">This invite link doesn&rsquo;t work</b>
          <span className="small">{ERRORS.bad_invite}</span>
          <Link href="/household" className="btn btn-2">Go to Household</Link>
        </div>
      ) : hh.inHousehold ? (
        <div className="card">
          <b className="b16">You&rsquo;re already in {hh.me?.household?.name}</b>
          <span className="small">One device can be in one household. Leave it in Settings first, then open the link again.</span>
          <Link href="/settings" className="btn btn-2">Settings</Link>
        </div>
      ) : (
        <form onSubmit={next} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p className="sub lead">{from} invited you to their household on Drift. You&rsquo;ll use Drift on this device, and you choose what to share.</p>
          <div className="card note">
            <Icon name="lock" />
            <span className="small">Check this code with {parsed.from ? firstName(parsed.from) : 'them'}: <b className="t1">{parsed.ownerFingerprint}</b>. It should match the code on their invite screen. Drift also checks it when you join.</span>
          </div>
          {!parsed.role && (
            <fieldset className="fieldset" style={{ gap: 10 }}>
              <legend style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Who are you?</legend>
              <Choice name="role" size={16} title="An adult" detail="Nothing shared by default." checked={role === 'adult'} onChange={() => setRole('adult')} />
              <Choice name="role" size={16} title="A teen, 13–17" detail="You choose what to share on the next screen." checked={role === 'teen'} onChange={() => setRole('teen')} />
            </fieldset>
          )}
          <label className="field">Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="How others see you" maxLength={60} autoComplete="given-name" required /></label>
          {error && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="bottom">
            <button type="submit" className="btn" disabled={!name.trim() || !role || step === 'joining'}>
              {step === 'joining' ? 'Joining…' : role === 'teen' ? 'Next' : 'Join household'}
            </button>
          </div>
        </form>
      )}
    </Screen>
  );
}
