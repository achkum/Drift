'use client';
// Runs one background Google sync per app open when it's due (connected, last export > 24 h ago).
import { useEffect } from 'react';
import { getGoogleStatus, shouldAutoSync } from '@/lib/connectors/google';
import { runGoogleSync } from '@/lib/ui/useGoogleSync';

let checked = false;

export function GoogleAutoSync() {
  useEffect(() => {
    if (checked) return;
    checked = true;
    // The OAuth return page starts its own sync.
    if (new URL(window.location.href).searchParams.has('google')) return;
    const t = window.setTimeout(async () => {
      try {
        const status = await getGoogleStatus();
        if (status.configured && status.connected && (await shouldAutoSync(status))) await runGoogleSync();
      } catch { /* offline or not configured: manual upload still works */ }
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
