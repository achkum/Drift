// Loads the multilingual sentence-embedding model with transformers.js (browser: WebGPU or WASM).
// transformers.js is imported dynamically so nothing heavy runs at import time or during SSR.
import type { ImportProgress } from '@/lib/types';
import type { EmbedFn } from './core';

/** Multilingual E5 small (~100 languages incl. Swedish), 384-dim. q8 weights ≈ 113 MB + 17 MB tokenizer. */
export const MODEL_ID = 'Xenova/multilingual-e5-small';
/** e5 models expect this prefix for symmetric tasks such as classification. */
export const MODEL_PREFIX = 'query: ';
export const MODEL_DOWNLOAD_MB = 130;

export type Device = 'webgpu' | 'wasm' | 'cpu';

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: ArrayLike<number>; dims: number[] }>;

const loaded = new Map<string, Promise<Extractor>>();

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (globalThis.navigator as { gpu?: { requestAdapter(): Promise<unknown> } } | undefined)?.gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load(device: Device, onProgress: (p: ImportProgress) => void): Promise<Extractor> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false; // always fetch from the Hub (then cached by the browser)
  let lastPct = -1;
  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'q8',
    device,
    progress_callback: (info: { status: string; progress?: number }) => {
      if (info.status !== 'progress_total' || typeof info.progress !== 'number') return;
      const pct = Math.floor(info.progress);
      if (pct === lastPct) return;
      lastPct = pct;
      onProgress({
        stage: 'loading-model',
        message: `Getting the topic model ready (about ${MODEL_DOWNLOAD_MB} MB the first time, then cached)`,
        fraction: Math.min(1, info.progress / 100),
      });
    },
  });
  return extractor as unknown as Extractor;
}

function loadCached(device: Device, onProgress: (p: ImportProgress) => void): Promise<Extractor> {
  let p = loaded.get(device);
  if (!p) {
    p = load(device, onProgress);
    loaded.set(device, p);
    p.catch(() => loaded.delete(device));
  }
  return p;
}

/**
 * Loads the model (WebGPU when available, else WASM; 'cpu' in node) and returns an embedding
 * function producing L2-normalised mean-pooled vectors. Rejects if the model can't load.
 */
export async function loadEmbedder(
  onProgress: (p: ImportProgress) => void = () => {},
  device?: Device,
): Promise<{ embed: EmbedFn; device: Device }> {
  onProgress({ stage: 'loading-model', message: 'Getting the topic model ready', fraction: 0 });
  const candidates: Device[] = device ? [device] : (await hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastError: unknown;
  for (const d of candidates) {
    try {
      const extractor = await loadCached(d, onProgress);
      const embed: EmbedFn = async (texts) => {
        if (texts.length === 0) return [];
        const out = await extractor(texts, { pooling: 'mean', normalize: true });
        const dim = out.dims[out.dims.length - 1];
        const data = out.data as Float32Array;
        return texts.map((_, i) => data.subarray(i * dim, (i + 1) * dim));
      };
      await embed(['query: test']); // fail here (and fall back) rather than mid-import
      onProgress({ stage: 'loading-model', message: 'Topic model ready', fraction: 1 });
      return { embed, device: d };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The topic model could not load');
}
