// OWNER: pipeline agent. Messages between ./index.ts and ./worker.ts.
import type { ImportProgress, ImportRecord } from '@/lib/types';
import type { UploadInput } from './files';

export type WorkerRequest = { type: 'import'; inputs: UploadInput[] };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'done'; records: ImportRecord[] }
  | { type: 'error'; message: string };
