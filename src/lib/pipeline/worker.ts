// OWNER: pipeline agent. Runs the heavy import (unzip + parse + analyse + save) off the main thread.
// Loaded with `new Worker(new URL('./worker.ts', import.meta.url))` from ./index.ts.
import { recomputeInsights, runImport } from './core';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse): void;
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
};

ctx.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg) return;
  const onProgress = (progress: Parameters<Parameters<typeof runImport>[1] & object>[0]) => ctx.postMessage({ type: 'progress', progress });
  const job: Promise<WorkerResponse> = msg.type === 'import'
    ? runImport(msg.inputs, onProgress, msg.settings).then((records) => ({ type: 'done', records }))
    : recomputeInsights(onProgress, msg.settings).then((insights) => ({ type: 'recomputed', insights }));
  job
    .then((res) => ctx.postMessage(res))
    .catch((err: unknown) => {
      ctx.postMessage({
        type: 'error',
        message: err instanceof Error && err.message ? err.message : 'Something went wrong while importing.',
      });
    });
};

ctx.postMessage({ type: 'ready' });
