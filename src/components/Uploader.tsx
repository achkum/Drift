'use client';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Icon } from './Icon';
import type { ImportProgress, ImportRecord } from '@/lib/types';
import { num, platformLabel, plural } from '@/lib/ui/format';

const ACCEPT = '.zip,.json,.html,.htm,.csv,application/zip,application/json,text/html,text/csv';

const STAGES: ImportProgress['stage'][] = ['reading', 'unzipping', 'parsing', 'enriching', 'loading-model', 'classifying', 'analysing', 'saving', 'done'];
const STAGE_LABEL: Record<ImportProgress['stage'], string> = {
  reading: 'Reading files',
  unzipping: 'Unzipping',
  parsing: 'Reading your history',
  enriching: 'Looking up missing titles',
  'loading-model': 'Loading the topic model',
  classifying: 'Sorting into topics',
  analysing: 'Working out your drift',
  saving: 'Saving on this device',
  done: 'Done',
  error: 'Something went wrong',
};

type State =
  | { kind: 'idle' }
  | { kind: 'working'; count: number }
  | { kind: 'done'; records: ImportRecord[] }
  | { kind: 'error'; message: string };

interface Props {
  hint?: string;
  progress: ImportProgress | null;
  importFiles(files: File[]): Promise<ImportRecord[]>;
  onFinished(): void;
}

// ── Folder drag and drop (DataTransfer entries) ─────────

interface FsEntry { isFile: boolean; isDirectory: boolean; name: string; fullPath: string }
interface FsFileEntry extends FsEntry { file(ok: (f: File) => void, err: (e: unknown) => void): void }
interface FsDirEntry extends FsEntry { createReader(): { readEntries(ok: (e: FsEntry[]) => void, err: (e: unknown) => void): void } }

function withPath(file: File, path: string): File {
  // Keep the folder path so parsers can recognise export layouts. Shadows the read-only getter.
  try { Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true }); } catch { /* ignore */ }
  return file;
}

async function readEntry(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const f = await new Promise<File>((ok, err) => (entry as FsFileEntry).file(ok, err));
    out.push(withPath(f, entry.fullPath.replace(/^\//, '')));
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FsDirEntry).createReader();
    // readEntries returns results in batches; call until empty.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
      if (!batch.length) break;
      for (const e of batch) await readEntry(e, out);
    }
  }
}

async function filesFromDrop(e: DragEvent): Promise<File[]> {
  const items = Array.from(e.dataTransfer.items ?? []);
  const entries = items
    .map((i) => (i.kind === 'file' && 'webkitGetAsEntry' in i ? (i.webkitGetAsEntry() as FsEntry | null) : null))
    .filter((x): x is FsEntry => !!x);
  if (entries.length && entries.some((x) => x.isDirectory)) {
    const out: File[] = [];
    for (const entry of entries) await readEntry(entry, out);
    return out;
  }
  return Array.from(e.dataTransfer.files ?? []);
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not implemented/i.test(msg)) return 'Importing isn’t available in this version yet. Your file was not read or stored.';
  return msg || 'Unknown error.';
}

export function Uploader({ hint, progress, importFiles, onFinished }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '');
    folderRef.current?.setAttribute('directory', '');
  }, [state.kind]);

  useEffect(() => {
    if (state.kind === 'done' || state.kind === 'error') statusRef.current?.focus();
  }, [state.kind]);

  async function run(files: File[]) {
    if (!files.length) return;
    setState({ kind: 'working', count: files.length });
    try {
      const records = await importFiles(files);
      setState({ kind: 'done', records });
    } catch (err) {
      setState({ kind: 'error', message: friendlyError(err) });
    }
  }

  if (state.kind === 'working') {
    const stage = progress?.stage ?? 'reading';
    const frac = progress?.fraction ?? Math.max(0.05, STAGES.indexOf(stage) / (STAGES.length - 1));
    return (
      <div className="outline" aria-live="polite" aria-busy="true">
        <span className="split"><b className="b15">{STAGE_LABEL[stage]}</b><span className="tiny">{plural(state.count, 'file')}</span></span>
        <div className="meter" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
          <span style={{ width: `${Math.round(frac * 100)}%` }} />
        </div>
        <span className="small">{progress?.message || 'Reading your export on this device.'}</span>
      </div>
    );
  }

  if (state.kind === 'done') {
    const events = state.records.reduce((s, r) => s + r.events, 0);
    const fresh = state.records.reduce((s, r) => s + r.newEvents, 0);
    const warnings = state.records.flatMap((r) => r.warnings);
    return (
      <div className="outline" ref={statusRef} tabIndex={-1} role="status">
        <b className="b16" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="check" className="ic-inline" style={{ width: 18, height: 18 }} />
          {state.records.length ? 'Export added' : 'Nothing found to import'}
        </b>
        {state.records.length > 0 ? (
          <>
            <span className="kv"><span>Items read</span><b>{num(events)}</b></span>
            <span className="kv"><span>New since last import</span><b>{num(fresh)}</b></span>
            {state.records.map((r) => (
              <span className="tiny" key={r.id}>{platformLabel(r.platform)}: {r.fileName}</span>
            ))}
          </>
        ) : (
          <span className="small">We couldn&rsquo;t find watch or search history in these files. Check the steps above and try the .zip or folder you downloaded.</span>
        )}
        {warnings.length > 0 && (
          <div className="card note amber" style={{ padding: '12px 14px' }}>
            <Icon name="warn" />
            <ul className="small" style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {state.records.length > 0 && <button type="button" className="btn" onClick={onFinished}>See my insights</button>}
          <button type="button" className="btn btn-2" onClick={() => setState({ kind: 'idle' })}>Add another file</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {state.kind === 'error' && (
        <div className="error-card" ref={statusRef} tabIndex={-1} role="alert">
          <b className="b15">We couldn&rsquo;t import that</b>
          <span className="small">{state.message}</span>
          <span className="tiny">Nothing was saved. You can try again with the same file.</span>
        </div>
      )}
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => { e.preventDefault(); setOver(false); void run(await filesFromDrop(e)); }}
      >
        <Icon name="upload" className="up-ic" />
        <span>
          <b className="b15">Drop your export here</b>
          <span className="small">{hint || 'The .zip file, or the unzipped folder.'}</span>
        </span>
        <div className="actions">
          <label className="btn-sm file-btn">
            Choose file
            <input
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void run(f); }}
            />
          </label>
          <label className="btn-sm ghost file-btn">
            Choose folder
            <input
              ref={folderRef}
              type="file"
              multiple
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void run(f); }}
            />
          </label>
        </div>
        <span className="tiny">.zip, .json, .html or .csv. Read on this device, never uploaded.</span>
      </div>
    </>
  );
}
