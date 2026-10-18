// OWNER: pipeline agent. Messages between ./index.ts and ./worker.ts.
import type { DriftSettings, ImportProgress, ImportRecord, Insights } from '@/lib/types';
import type { UploadInput } from './files';

export type WorkerRequest =
  | { type: 'import'; inputs: UploadInput[]; settings: DriftSettings }
  | { type: 'recompute'; settings: DriftSettings };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'done'; records: ImportRecord[] }
  | { type: 'recomputed'; insights: Insights | null }
  | { type: 'error'; message: string };
