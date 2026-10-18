// OWNER: pipeline agent. Runs the heavy import (unzip + parse + analyse + save) off the main thread.
// Loaded with `new Worker(new URL('./worker.ts', import.meta.url))` from ./index.ts.
import { runImport } from './core';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse): void;
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
};

ctx.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'import') return;
  runImport(msg.inputs, (progress) => ctx.postMessage({ type: 'progress', progress }))
    .then((records) => ctx.postMessage({ type: 'done', records }))
    .catch((err: unknown) => {
      ctx.postMessage({
        type: 'error',
        message: err instanceof Error && err.message ? err.message : 'Something went wrong while importing.',
      });
    });
};

ctx.postMessage({ type: 'ready' });
