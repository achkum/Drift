'use client';
import { useEffect, useState } from 'react';
import { PageTitle, Screen } from '../Screen';
import { Icon } from '../Icon';
import { Loading } from '../bits';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { useDrift } from '@/lib/pipeline/useDrift';
import { exportResults } from '@/lib/pipeline';
import { bytes, dateShort, num, platformLabel, plural } from '@/lib/ui/format';

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
  const { insights, isSample, imports, status, deleteAll } = useDrift();
  const toast = useToast();
  const [keep, setKeep] = useState<Keep>('2y');
  const [lookup, setLookup] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const usage = useStorageEstimate(imports.length);

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
      setConfirm(false);
      toast('Everything Drift stored on this device was deleted.');
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

      <label className="outline" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
        <span style={{ flex: 1 }}><b className="b15">Look up missing video titles</b><span className="tiny">Sends only video IDs to fetch titles. Off by default.</span></span>
        <input type="checkbox" className="sw" checked={lookup} onChange={(e) => setLookup(e.target.checked)} />
      </label>

      <div className="bottom">
        <button type="button" className="btn btn-2" onClick={onExport} disabled={busy !== null || isSample} aria-describedby={isSample ? 'export-note' : undefined}>
          {busy === 'export' ? 'Preparing…' : 'Export my results'}
        </button>
        {isSample && status === 'ready' && <span className="tiny" id="export-note" style={{ textAlign: 'center' }}>Import an export first to save your results.</span>}
        <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)} disabled={busy !== null}>Delete all my data</button>
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
