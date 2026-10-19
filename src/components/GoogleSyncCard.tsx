'use client';
// Automatic YouTube + Google Search sync through Google's Data Portability API.
// Hidden when the server isn't configured: manual upload stays the way in.
import { useState } from 'react';
import { Icon } from './Icon';
import { useGoogleSync } from '@/lib/ui/useGoogleSync';
import { STAGE_LABEL, stageFraction } from '@/lib/ui/stages';
import { dateShort } from '@/lib/ui/format';

export function GoogleSyncCard({ compact = false }: { compact?: boolean }) {
  const g = useGoogleSync();
  const [confirmOff, setConfirmOff] = useState(false);
  const s = g.status;
  if (!s || !s.configured) return null;

  const notice = g.notice && (
    <div className={g.notice.kind === 'ok' ? 'outline note' : 'error-card'} role={g.notice.kind === 'ok' ? 'status' : 'alert'}>
      <span className="small t1">{g.notice.text}</span>
    </div>
  );

  if (!s.connected) {
    return (
      <>
        {notice}
        <div className="card" style={{ gap: 10 }}>
          <b className="b16">Connect Google automatically</b>
          <span className="small">
            Drift asks Google for your YouTube and search history once a day, using Google&rsquo;s official
            data-transfer service. Your history is analysed on this device.
          </span>
          {!compact && (
            <span className="tiny">
              You choose 30 or 180 days of access on Google&rsquo;s page and can stop it anytime. Not available for
              accounts under 18: use the upload below instead.
            </span>
          )}
          <button type="button" className="btn" onClick={g.connect}>Connect Google</button>
          {s.mock && <span className="tiny">Test mode: no real Google account is used.</span>}
        </div>
      </>
    );
  }

  const p = g.progress;
  const frac = stageFraction(p);
  const last = g.info.lastSyncAt;
  // Google allows one time-based export per 24 h; don't offer a sync that it would refuse.
  const nextAt = last && !s.mock ? new Date(last).getTime() + 24 * 3600 * 1000 : 0;
  const tooSoon = nextAt > Date.now();
  return (
    <>
      {notice}
      <div className="outline" style={{ gap: 10 }}>
        <span className="split">
          <b className="b16">Google and YouTube</b>
          <span className="tag tag-ok"><Icon name="check" style={{ width: 14, height: 14 }} />Connected</span>
        </span>
        <span className="small">
          Automatic, syncs daily. {last ? `Last synced ${dateShort(last, false)}.` : 'Not synced yet.'}
          {s.expiresAt ? ` Access lasts until ${dateShort(s.expiresAt, false)}.` : ''}
        </span>
        {g.syncing && (
          <div aria-live="polite" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="tiny" style={{ fontWeight: 700 }}>{!p || p.stage === 'reading' ? 'Getting your history from Google' : STAGE_LABEL[p.stage]}</span>
            <div className="meter" role="progressbar" aria-label="Sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
              <span style={{ width: `${Math.round(frac * 100)}%` }} />
            </div>
            <span className="small">{p?.message ?? 'Asking Google for your latest history'}</span>
          </div>
        )}
        {!g.syncing && p?.stage === 'error' && <span className="small" role="alert" style={{ color: 'var(--red)' }}>{p.message}</span>}
        {!g.syncing && p?.stage === 'done' && <span className="small" role="status">{p.message}</span>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-sm" onClick={() => void g.sync()} disabled={g.syncing || tooSoon}>Sync now</button>
          {confirmOff ? (
            <button type="button" className="btn-sm ghost" onClick={() => { setConfirmOff(false); void g.disconnect(); }}>Yes, disconnect</button>
          ) : (
            <button type="button" className="btn-sm ghost" onClick={() => setConfirmOff(true)} disabled={g.syncing}>Disconnect</button>
          )}
        </div>
        {tooSoon && !g.syncing && <span className="tiny">Google allows one export a day. Next sync after {dateShort(new Date(nextAt).toISOString(), false)}.</span>}
        {confirmOff && <span className="tiny">Stops daily sync and removes Drift&rsquo;s access at Google. Data already on this device stays until you delete it.</span>}
        {s.mock && <span className="tiny">Test mode: synthetic history, no real Google account.</span>}
      </div>
    </>
  );
}
