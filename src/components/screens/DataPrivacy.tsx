'use client';
import { useEffect, useState } from 'react';
import { PageTitle, Screen } from '../Screen';
import { Icon } from '../Icon';
import { Loading } from '../bits';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { useHouseholdLive } from '../HouseholdProvider';
import { useDrift } from '@/lib/pipeline/useDrift';
import { exportResults } from '@/lib/pipeline';
import { bytes, dateShort, num, platformLabel, plural } from '@/lib/ui/format';
import { RECOMPUTE_STAGES, STAGE_LABEL, stageFraction } from '@/lib/ui/stages';
import type { DriftSettings } from '@/lib/types';

type Keep = '1y' | '2y' | 'forever';
const KEEP: { value: Keep; label: string }[] = [
  { value: '1y', label: '1 year' },
  { value: '2y', label: '2 years' },
  { value: 'forever', label: 'Until I delete it' },
];

function historySpan(months: number): string {
  if (months < 1) return 'no history yet';
  if (months < 24) return `${plural(months, 'month')} of history`;
  return `${Math.floor(months / 12)} years of history`;
}

function useStorageEstimate(deps: unknown): number | null {
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    navigator.storage?.estimate?.().then((e) => { if (live) setUsage(e.usage ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [deps]);
  return usage;
}

export function DataScreen() {
  const { insights, isSample, imports, status, deleteAll, settings, updateSettings, recompute, progress } = useDrift();
  const hh = useHouseholdLive();
  const toast = useToast();
  const [keep, setKeep] = useState<Keep>('2y');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  /** A setting changed and the stored results don't reflect it yet. */
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const usage = useStorageEstimate(imports.length);
  const locked = status !== 'ready' || isSample || running || busy !== null;
  const frac = stageFraction(progress, RECOMPUTE_STAGES);

  function onToggle(key: keyof DriftSettings, value: boolean) {
    updateSettings({ [key]: value });
    setPending(true);
    setRan(false);
  }

  async function onUpdate() {
    setPending(false);
    setRunning(true);
    setRan(false);
    await recompute();
    setRunning(false);
    setRan(true);
  }

  const summary = isSample
    ? 'Nothing imported yet. Drift is showing sample data.'
    : `${plural(insights.platforms.length, 'platform')}, ${historySpan(insights.months.length)}${usage ? `, ${bytes(usage)}` : ''}`;

  async function onExport() {
    setBusy('export');
    try {
      const blob = await exportResults();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drift-results-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Your results file is ready to save.');
    } catch {
      toast('Couldn’t create the results file. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    setBusy('delete');
    try {
      await deleteAll();
      // Also leave the household, delete shared copies on the server and wipe the household keys.
      let serverDeleted = true;
      try {
        const { deleteHouseholdData } = await import('@/lib/household');
        serverDeleted = (await deleteHouseholdData()).serverDeleted;
      } catch { serverDeleted = false; }
      void hh.refresh();
      setConfirm(false);
      toast(serverDeleted
        ? 'Everything Drift stored on this device was deleted.'
        : 'Deleted on this device. Drift couldn’t reach the household server, so shared copies there were not removed.');
    } catch {
      toast('Couldn’t delete your data. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen tabbed back="/settings">
      <PageTitle>Data and privacy</PageTitle>
      <div className="card" style={{ gap: 6 }}>
        <b style={{ fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="phone" className="ic-inline" style={{ width: 18, height: 18 }} />Stored only on this device
        </b>
        <span className="small">{status === 'ready' ? summary : ' '}</span>
      </div>

      <h2 className="group-label">Imports</h2>
      {status !== 'ready' ? (
        <Loading blocks={[56]} />
      ) : imports.length === 0 ? (
        <div className="list"><div className="row"><span className="small">No imports yet.</span></div></div>
      ) : (
        <div className="list">
          {[...imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map((im) => (
            <div className="row" key={im.id}>
              <span className="grow">
                <b style={{ fontSize: 15 }}>{im.fileName}</b>
                <span className="tiny">{platformLabel(im.platform)}, {dateShort(im.importedAt)}, {num(im.events)} items</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <h2 className="group-label" id="keep-label">Keep my history for</h2>
      <div className="list" role="radiogroup" aria-labelledby="keep-label">
        {KEEP.map((k) => (
          <label className="row" style={{ justifyContent: 'space-between' }} key={k.value}>
            {k.label}
            <input type="radio" name="keep" checked={keep === k.value} onChange={() => setKeep(k.value)} />
          </label>
        ))}
      </div>

      <h2 className="group-label" id="processing-label">How Drift reads your history</h2>
      <div className="list" role="group" aria-labelledby="processing-label" aria-describedby={isSample && status === 'ready' ? 'processing-note' : undefined}>
        <label className="row">
          <span className="grow">
            <b style={{ fontSize: 15 }}>Smarter topics</b>
            <span className="tiny">Uses a language model on this device to sort videos into topics. Downloads about 120 MB once.</span>
          </span>
          <input type="checkbox" className="sw" checked={settings.smartTopics} disabled={locked} onChange={(e) => onToggle('smartTopics', e.target.checked)} />
        </label>
        <label className="row">
          <span className="grow">
            <b style={{ fontSize: 15 }}>Look up missing video titles</b>
            <span className="tiny">Sends only video links to YouTube and TikTok to fetch titles. Helps with TikTok, whose export has no titles. Off by default.</span>
          </span>
          <input type="checkbox" className="sw" checked={settings.titleLookup} disabled={locked} onChange={(e) => onToggle('titleLookup', e.target.checked)} />
        </label>
      </div>
      {isSample && status === 'ready' && (
        <span className="tiny" id="processing-note">These change how Drift reads your own history. Import an export first to use them.</span>
      )}

      {running ? (
        <div className="outline" aria-live="polite" aria-busy="true">
          <b className="b15">{STAGE_LABEL[progress?.stage ?? 'analysing']}</b>
          <div className="meter" role="progressbar" aria-label="Update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
            <span style={{ width: `${Math.round(frac * 100)}%` }} />
          </div>
          <span className="small">{progress?.message && progress.message !== 'Starting' ? progress.message : 'Updating your results on this device.'}</span>
        </div>
      ) : pending ? (
        <div className="card" role="status">
          <b className="b15">Update your results with this change?</b>
          <span className="small">
            Drift re-reads the history already on this device.{settings.smartTopics ? ' The first time, the topic model downloads before sorting starts.' : ''}
            {' '}New imports use your settings either way.
          </span>
          <button type="button" className="btn" onClick={onUpdate}>Update my results</button>
          <button type="button" className="btn-text" onClick={() => setPending(false)}>Not now</button>
        </div>
      ) : ran && progress?.stage === 'error' ? (
        <div className="error-card" role="alert">
          <b className="b15">We couldn&rsquo;t update your results</b>
          <span className="small">{progress.message}</span>
          <span className="tiny">Your previous results are still here.</span>
          <button type="button" className="btn btn-2" onClick={onUpdate}>Try again</button>
        </div>
      ) : ran && progress?.stage === 'done' ? (
        <div className="outline note" role="status">
          <Icon name="check" style={{ stroke: 'var(--accent)' }} />
          <span className="small t1">{insights.classifierNote ?? 'Your results are up to date with these settings.'}</span>
        </div>
      ) : null}

      <div className="bottom">
        <button type="button" className="btn btn-2" onClick={onExport} disabled={busy !== null || isSample || running} aria-describedby={isSample ? 'export-note' : undefined}>
          {busy === 'export' ? 'Preparing…' : 'Export my results'}
        </button>
        {isSample && status === 'ready' && <span className="tiny" id="export-note" style={{ textAlign: 'center' }}>Import an export first to save your results.</span>}
        <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)} disabled={busy !== null || running}>Delete all my data</button>
        <span className="tiny" style={{ textAlign: 'center' }}>Deleting removes every import and result stored on this device.</span>
      </div>

      <Sheet open={confirm} onClose={() => busy === null && setConfirm(false)} title="Delete all your data?" role="alertdialog">
        <p className="small">This removes your imported history, your results and your import list from this device. It can&rsquo;t be undone. Your original export files are not touched.</p>
        <button type="button" className="btn btn-danger-solid" onClick={onDelete} disabled={busy !== null}>
          {busy === 'delete' ? 'Deleting…' : 'Delete everything'}
        </button>
        <button type="button" className="btn btn-2" data-autofocus onClick={() => setConfirm(false)} disabled={busy !== null}>Cancel</button>
      </Sheet>
    </Screen>
  );
}
