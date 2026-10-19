'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageTitle, Screen, StepProgress } from '../Screen';
import { Icon } from '../Icon';
import { GoogleSyncCard } from '../GoogleSyncCard';
import { useDrift } from '@/lib/pipeline/useDrift';
import { setOnboarded, useOnboarded } from '@/lib/ui/prefs';
import { dateShort, num } from '@/lib/ui/format';
import type { ImportRecord, Insights, Platform } from '@/lib/types';
import { UPLOAD_LABEL, UPLOAD_PLATFORMS, type UploadPlatform } from '@/lib/ui/platforms';

const MATCHES: Record<UploadPlatform, Platform[]> = {
  youtube: ['youtube', 'google_search'],
  tiktok: ['tiktok'],
  instagram: ['instagram'],
};

/** Automatic Google sync imports YouTube and Google Search together, so the record is 'mixed'. */
function isGoogleSync(i: ImportRecord): boolean {
  return i.fileName.startsWith('google-sync-');
}

export function importStatus(p: UploadPlatform, imports: ImportRecord[], insights: Insights, isSample: boolean): string | null {
  const own = imports
    .filter((i) => (i.platform !== 'mixed' && MATCHES[p].includes(i.platform)) || (p === 'youtube' && isGoogleSync(i)))
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  if (own.length) {
    const events = own.reduce((s, i) => s + i.events, 0);
    return `Imported ${dateShort(own[0].importedAt, false)}, ${num(events)} items`;
  }
  if (!isSample) {
    const items = insights.platforms.filter((x) => MATCHES[p].includes(x.platform)).reduce((s, x) => s + x.items, 0);
    if (items > 0) return `${num(items)} items imported`;
  }
  return null;
}

export function ConnectScreen() {
  const router = useRouter();
  const onboarded = useOnboarded();
  const { imports, insights, isSample, status } = useDrift();
  const mixed = imports.filter((i) => i.platform === 'mixed' && !isGoogleSync(i));

  const finish = () => { setOnboarded(true); router.push('/home'); };

  return (
    <Screen
      back={onboarded === false ? '/onboarding/privacy' : '/settings'}
      right={<span className="step ob-only">Step 3 of 3</span>}
      beforeScroll={<div className="ob-only"><StepProgress step={3} /></div>}
      scrollClassName="ob"
    >
      <PageTitle>
        <span className="ob-only">Connect your platforms</span>
        <span className="after-ob">Connected platforms</span>
      </PageTitle>
      <p className="sub lead">Start with one. The more you add, the fuller the picture.</p>

      <GoogleSyncCard compact />

      <div className="list">
        {UPLOAD_PLATFORMS.map((p) => {
          const done = status === 'ready' ? importStatus(p, imports, insights, isSample) : null;
          return (
            <div className="row" key={p}>
              <span className="mono" aria-hidden="true">{p === 'youtube' ? 'G' : UPLOAD_LABEL[p][0]}</span>
              <span className="grow">
                <b>{UPLOAD_LABEL[p]}</b>
                {done ? (
                  <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-t)' }}>
                    <Icon name="check" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }} />
                    {done}
                  </span>
                ) : (
                  <span className="small">Upload your data export</span>
                )}
              </span>
              <Link href={`/connect/${p}`} className={`btn-sm${done ? ' ghost' : ''}`} aria-label={`${done ? 'Update' : 'Start'} ${UPLOAD_LABEL[p]}`}>
                {done ? 'Update' : 'Start'}
              </Link>
            </div>
          );
        })}
        {(['Facebook', 'X'] as const).map((name) => (
          <div className="row" key={name}>
            <span className="mono off" aria-hidden="true">{name[0]}</span>
            <span className="grow"><b style={{ color: 'var(--t2)' }}>{name}</b><span className="small">Coming later</span></span>
          </div>
        ))}
      </div>

      {mixed.length > 0 && (
        <p className="small">
          Also imported: {mixed.map((m) => `${m.fileName} (${dateShort(m.importedAt, false)})`).join(', ')}.
        </p>
      )}
      <p className="small">Exports are read on this device. Nothing is uploaded. With automatic Google sync, Google&rsquo;s archive may pass through Drift&rsquo;s server on its way to this device; it is never stored there.</p>

      <div className="bottom ob-only">
        <button type="button" className="btn" onClick={finish}>See my insights</button>
      </div>
    </Screen>
  );
}
