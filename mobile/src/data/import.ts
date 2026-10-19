// The mobile import pipeline: files -> ExportFile[] -> parseExport -> merge with stored data ->
// analyse (keyword classifier) -> save. Mirrors src/lib/pipeline/core.ts, minus the optional
// on-device ML model and title lookup (not available on mobile yet).
import './shims';
import { analyse, createKeywordClassifier } from '@/lib/analysis';
import { parseExport } from '@/lib/parsers';
import type {
  DriftEvent, ImportProgress, ImportRecord, Insights, ParseResult, TopicClassifier,
} from '@/lib/types';
import { collectExportFiles, normalisePath, type SourceFile } from './collect';
import {
  NOT_AN_EXPORT_MESSAGE, PLATFORM_LABELS, dedupeEvents, hasAnyData,
  mergeAdvertisers, mergeFollows, mergeInterests,
} from './merge';
import * as store from './store';

export { NOT_AN_EXPORT_MESSAGE };

export interface PickedFile { uri: string; name: string; size?: number }

/** An error meant to be shown to the user as-is. */
export class DriftImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriftImportError';
  }
}

type Progress = (p: ImportProgress) => void;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Wraps the classifier so 'classifying' gets a real fraction and the UI thread gets air. */
function trackingClassifier(inner: TopicClassifier, total: number, onProgress: Progress): TopicClassifier {
  let done = 0;
  return {
    name: inner.name,
    async classify(items) {
      const res = await inner.classify(items);
      done += items.length;
      onProgress({
        stage: 'classifying',
        message: 'Sorting what you watched into topics',
        fraction: total ? Math.min(1, done / total) : 1,
      });
      await yieldToUi();
      return res;
    },
  };
}

/** Turns picker results into byte sources (native only; imports expo-file-system lazily). */
export async function sourcesFromPicked(files: { uri: string; name: string }[]): Promise<SourceFile[]> {
  const { fileSource } = await import('./fileSource');
  return files.map((f) => ({ name: f.name, source: fileSource(f.uri) }));
}

/** Re-analyses everything stored. Returns null when nothing is stored. */
export async function recomputeInsights(onProgress: Progress = () => {}): Promise<Insights | null> {
  const data = await store.readAll();
  if (data.events.length === 0) return null;
  const base = createKeywordClassifier();
  onProgress({ stage: 'classifying', message: 'Sorting what you watched into topics', fraction: 0 });
  await yieldToUi();
  const { insights } = await analyse(data, trackingClassifier(base, data.events.length, onProgress));
  insights.classifier = base.name;
  onProgress({ stage: 'saving', message: 'Saving your results on this device' });
  await yieldToUi();
  await store.saveInsights(insights);
  return insights;
}

/** Full import. Throws DriftImportError for problems the user can fix. */
export async function runImport(inputs: SourceFile[], onProgress: Progress = () => {}): Promise<ImportRecord[]> {
  if (inputs.length === 0) throw new DriftImportError('Choose a file or folder to import.');

  // 1-2. reading + unzipping
  const { files } = await collectExportFiles(inputs, onProgress);
  if (files.length === 0) {
    throw new DriftImportError(
      `We couldn't find any data files (.json, .html, .csv or .txt) in what you uploaded. ${NOT_AN_EXPORT_MESSAGE}`,
    );
  }

  // 3. parsing
  onProgress({ stage: 'parsing', message: `Reading your history from ${files.length} file${files.length === 1 ? '' : 's'}`, fraction: 0 });
  await yieldToUi();
  let results: ParseResult[];
  try {
    results = await parseExport(files);
  } catch (err) {
    const why = err instanceof Error && err.message ? ` (${err.message})` : '';
    throw new DriftImportError(`Drift recognised your export but couldn't read it${why}. Try requesting a fresh export in JSON format.`);
  }
  if (!results || results.length === 0) throw new DriftImportError(NOT_AN_EXPORT_MESSAGE);
  if (!results.some(hasAnyData)) {
    const warnings = results.flatMap((r) => r.warnings).filter(Boolean);
    const names = [...new Set(results.map((r) => PLATFORM_LABELS[r.platform]))].join(' and ');
    throw new DriftImportError(
      `We found a ${names} export, but no activity in it.` + (warnings.length ? ` ${warnings.join(' ')}` : ''),
    );
  }
  onProgress({ stage: 'parsing', message: 'Read your history', fraction: 1 });
  await yieldToUi();

  // Merge with what is stored, in memory; nothing is written unless analysis succeeds.
  const stored = await store.readAll();
  const { fresh, perResultNew } = dedupeEvents(results, new Set(stored.events.map((e) => e.id)));
  const events: DriftEvent[] = stored.events.concat(fresh);
  const newFollows = results.flatMap((r) => r.follows);
  const newInterests = results.flatMap((r) => r.interests);
  const newAdvertisers = results.flatMap((r) => r.advertisers);
  const base = createKeywordClassifier();

  // 4-5. classifying + analysing
  onProgress({ stage: 'classifying', message: 'Sorting what you watched into topics', fraction: 0 });
  await yieldToUi();
  let analysingReported = false;
  const reportAnalysing = () => {
    if (analysingReported) return;
    analysingReported = true;
    onProgress({ stage: 'analysing', message: 'Measuring how your feed drifted' });
  };
  const classifier = trackingClassifier(base, events.length, (p) => {
    onProgress(p);
    if (p.fraction === 1) reportAnalysing();
  });
  let insights: Insights;
  try {
    ({ insights } = await analyse(
      {
        events,
        follows: mergeFollows(stored.follows, newFollows),
        interests: mergeInterests(stored.interests, newInterests),
        advertisers: mergeAdvertisers(stored.advertisers, newAdvertisers),
      },
      classifier,
    ));
  } catch (err) {
    const why = err instanceof Error && err.message ? ` (${err.message})` : '';
    throw new DriftImportError(`Your export was read, but Drift couldn't analyse it${why}. Nothing was saved.`);
  }
  reportAnalysing();
  insights.classifier = base.name;
  await yieldToUi();

  // 6. saving
  onProgress({ stage: 'saving', message: 'Saving on this device (nothing is uploaded)', fraction: 0 });
  const importedAt = new Date().toISOString();
  const sourceByPath = new Map(files.map((f) => [f.path, f.source]));
  const allSources = [...new Set(files.map((f) => f.source))];
  const records: ImportRecord[] = results.map((r, i) => {
    const used = [...new Set(r.filesUsed.map((p) => sourceByPath.get(normalisePath(p))).filter((s): s is string => !!s))];
    return {
      id: newId(),
      platform: r.platform,
      importedAt,
      fileName: (used.length ? used : allSources).join(', '),
      events: r.events.length,
      newEvents: perResultNew[i],
      warnings: r.warnings,
    };
  });
  await store.addEvents(fresh);
  onProgress({ stage: 'saving', message: 'Saving on this device (nothing is uploaded)', fraction: 0.6 });
  await store.addFollows(newFollows);
  await store.addInterests(newInterests);
  await store.addAdvertisers(newAdvertisers);
  await store.addImports(records);
  await store.saveInsights(insights);

  const totalNew = perResultNew.reduce((a, b) => a + b, 0);
  const platforms = [...new Set(results.map((r) => PLATFORM_LABELS[r.platform]))].join(', ');
  onProgress({
    stage: 'done',
    message: totalNew > 0
      ? `Imported ${totalNew.toLocaleString('en')} new item${totalNew === 1 ? '' : 's'} from ${platforms}.`
      : `Nothing new from ${platforms}: everything in this export was already imported.`,
    fraction: 1,
  });
  return records;
}

/** Imports files chosen with expo-document-picker. */
export async function importPicked(files: PickedFile[], onProgress: Progress = () => {}): Promise<ImportRecord[]> {
  return runImport(await sourcesFromPicked(files), onProgress);
}
