'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle, Screen } from '../Screen';
import { Chev, Icon } from '../Icon';
import { Seg, SwitchRow } from '../controls';
import { useToast } from '../Toast';
import { useDrift } from '@/lib/pipeline/useDrift';
import { setOnboarded, setThemePref, useSystemDark, useThemePref, type ThemePref } from '@/lib/ui/prefs';
import { QLOG } from '@/lib/sample/household';
import { plural } from '@/lib/ui/format';

const THEMES: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Icon name="sun" /> },
  { value: 'dark', label: 'Dark', icon: <Icon name="moon" /> },
  { value: 'system', label: 'System', icon: <Icon name="monitor" /> },
];

function NavRow({ href, title, detail }: { href: string; title: string; detail?: string }) {
  return (
    <Link href={href} className="row">
      <span className="grow"><b style={{ fontSize: 15 }}>{title}</b>{detail && <span className="tiny">{detail}</span>}</span>
      <Chev />
    </Link>
  );
}

export function SettingsScreen() {
  const pref = useThemePref();
  const systemDark = useSystemDark();
  const router = useRouter();
  const toast = useToast();
  const { imports, insights, isSample, status } = useDrift();
  const [digest, setDigest] = useState(true);
  const [alerts, setAlerts] = useState(true);

  const themeNote = pref === null ? ' '
    : pref === 'system' ? `Following your device: ${systemDark ? 'dark' : 'light'}`
    : pref === 'dark' ? 'Always dark' : 'Always light';

  const platformCount = isSample ? new Set(imports.map((i) => i.platform)).size : insights.platforms.length;
  const connectedDetail = status !== 'ready' ? ' '
    : platformCount ? `${plural(platformCount, 'platform')} imported` : 'Nothing imported yet';

  const restart = () => { setOnboarded(false); router.push('/'); };

  return (
    <Screen tabbed>
      <PageTitle>Settings</PageTitle>

      <h2 className="group-label">Appearance</h2>
      <div className="outline">
        <Seg label="Theme" options={THEMES.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} value={pref} onChange={setThemePref} />
        <span className="tiny" aria-live="polite">{themeNote}</span>
      </div>

      <h2 className="group-label">Data</h2>
      <div className="list">
        <NavRow href="/connect" title="Connected platforms" detail={connectedDetail} />
        <NavRow href="/settings/data" title="Data and privacy" detail="Smarter topics, title lookup, storage, delete" />
        <NavRow href="/ads" title="Who targets you" detail="Advertisers, ad tricks and ad settings" />
      </div>

      <h2 className="group-label">Household</h2>
      <div className="list">
        <NavRow href="/household" title="Members" />
        <NavRow href="/sharing" title="What you share" />
        <NavRow href="/settings/questions" title="Questions about you" detail={`${QLOG.length} this month`} />
      </div>

      <h2 className="group-label">Notifications</h2>
      <div className="list">
        <SwitchRow small title="Weekly digest" detail="Sundays" checked={digest} onChange={setDigest} />
        <SwitchRow small title="Safety alerts" detail="Sharp shifts toward harmful topics" checked={alerts} onChange={setAlerts} />
      </div>

      <h2 className="group-label">About</h2>
      <div className="list">
        <button type="button" className="row" onClick={() => toast('Help centre opens here.')}>
          <span className="grow"><b style={{ fontSize: 15 }}>Help</b></span><Chev />
        </button>
        <button type="button" className="row" onClick={restart}>
          <span className="grow"><b style={{ fontSize: 15 }}>Replay onboarding</b></span><Chev />
        </button>
        <button type="button" className="row" onClick={restart}>
          <span className="grow"><b style={{ fontSize: 15 }}>Sign out</b></span>
        </button>
      </div>
    </Screen>
  );
}
