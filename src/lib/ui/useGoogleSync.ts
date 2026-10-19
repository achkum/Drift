'use client';
// State for automatic Google (YouTube + Search) sync, shared by the connect card and auto-sync.
import { useCallback, useEffect, useState } from 'react';
import {
  connectGoogle, disconnectGoogle, getGoogleStatus, getGoogleSyncInfo, GoogleSyncError, syncGoogle,
  type GoogleSyncInfo,
} from '@/lib/connectors/google';
import type { GoogleStatusResponse } from '@/lib/connectors/google/types';
import { notifyDataChanged } from '@/lib/pipeline/useDrift';
import type { ImportProgress } from '@/lib/types';

const SYNC_EVENT = 'drift-google-sync';
let running: Promise<void> | null = null;
let lastProgress: ImportProgress | null = null;

function emit(p: ImportProgress | null) {
  lastProgress = p;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

export function syncErrorMessage(err: unknown): string {
  if (err instanceof GoogleSyncError) {
    if (err.code === 'already_exported') return 'Google allows one export a day. Drift will sync again tomorrow.';
    if (err.code === 'reauth_required' || err.code === 'not_connected') return 'Google access has ended. Connect again to keep syncing.';
    return err.message;
  }
  return err instanceof Error && err.message ? err.message : 'Sync failed. Your earlier data is still here.';
}

/** One sync at a time across the whole page. Resolves when done; errors end up in progress. */
export function runGoogleSync(): Promise<void> {
  if (running) return running;
  emit({ stage: 'reading', message: 'Asking Google for your latest history', fraction: 0 });
  running = syncGoogle((p) => emit(p))
    .then(() => {
      emit({ stage: 'done', message: 'Synced with Google.', fraction: 1 });
      notifyDataChanged();
    })
    .catch((err: unknown) => emit({ stage: 'error', message: syncErrorMessage(err) }))
    .finally(() => { running = null; });
  return running;
}

export interface GoogleSyncState {
  status: GoogleStatusResponse | null;
  info: GoogleSyncInfo;
  progress: ImportProgress | null;
  syncing: boolean;
  /** Message from the OAuth redirect (?google=connected|error). */
  notice: { kind: 'ok' | 'error'; text: string } | null;
  sync(): Promise<void>;
  connect(): void;
  disconnect(): Promise<void>;
}

const REASONS: Record<string, string> = {
  access_denied: 'You cancelled on Google’s page. Nothing was connected.',
  not_configured: 'Automatic sync isn’t set up on this server yet. Upload your export instead.',
  no_refresh_token: 'Google didn’t grant ongoing access. Try again and choose 30 or 180 days.',
  no_scopes: 'No data was shared. Tick YouTube history on Google’s page to connect.',
};

export function useGoogleSync(): GoogleSyncState {
  const [status, setStatus] = useState<GoogleStatusResponse | null>(null);
  const [info, setInfo] = useState<GoogleSyncInfo>({});
  const [progress, setProgress] = useState<ImportProgress | null>(lastProgress);
  const [syncing, setSyncing] = useState(running !== null);
  const [notice, setNotice] = useState<GoogleSyncState['notice']>(null);

  const refresh = useCallback(async () => {
    setInfo(getGoogleSyncInfo());
    try { setStatus(await getGoogleStatus()); } catch { setStatus({ configured: false, connected: false }); }
  }, []);

  useEffect(() => {
    void refresh();
    const on = () => { setProgress(lastProgress); setSyncing(running !== null); setInfo(getGoogleSyncInfo()); if (!running) void refresh(); };
    window.addEventListener(SYNC_EVENT, on);
    // Read and clear the OAuth redirect result.
    const url = new URL(window.location.href);
    const g = url.searchParams.get('google');
    if (g) {
      const reason = url.searchParams.get('reason') ?? '';
      setNotice(g === 'connected'
        ? { kind: 'ok', text: 'Google is connected. Drift is getting your history now.' }
        : { kind: 'error', text: REASONS[reason] ?? 'Google couldn’t be connected. Try again, or upload your export instead.' });
      url.searchParams.delete('google'); url.searchParams.delete('reason');
      window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
      if (g === 'connected') void runGoogleSync();
    }
    return () => window.removeEventListener(SYNC_EVENT, on);
  }, [refresh]);

  return {
    status, info, progress, syncing, notice,
    sync: runGoogleSync,
    connect: connectGoogle,
    disconnect: async () => { await disconnectGoogle(); await refresh(); },
  };
}
