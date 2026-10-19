// OWNER: pipeline agent. The import pipeline itself, environment agnostic (main thread or worker):
// collect files -> parseExport -> merge with stored data -> analyse -> save.
import { analyse } from '@/lib/analysis';
import { parseExport } from '@/lib/parsers';
import * as store from '@/lib/store';
import type {
  AdvertiserRecord, DriftEvent, FollowRecord, ImportProgress, ImportRecord, Insights,
  DriftSettings, ParseResult, Platform, PlatformInterestList, TopicClassifier,
} from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { enrichEvents, getClassifier, lastModelError } from './extensions';
import { collectExportFiles, normalisePath, type UploadInput } from './files';

export const PLATFORM_LABELS: Record<Platform | 'mixed', string> = {
  youtube: 'YouTube',
  google_search: 'Google Search',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  mixed: 'several platforms',
};

/** An error meant to be shown to the user as-is. */
export class DriftImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriftImportError';
  }
}

export const NOT_AN_EXPORT_MESSAGE =
  "This doesn't look like a YouTube, TikTok or Instagram export. Upload the .zip file you downloaded " +
  '(or the unzipped folder) as it is, without renaming or moving files inside it. ' +
  'For YouTube, choose JSON as the format when you request the export.';

type Progress = (p: ImportProgress) => void;

const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Wraps the classifier so the 'classifying' stage gets a real fraction. */
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
      return res;
    },
  };
}

function mergeFollows(a: FollowRecord[], b: FollowRecord[]): FollowRecord[] {
  const m = new Map<string, FollowRecord>();
  for (const f of [...a, ...b]) m.set(`${f.platform}:${f.name.toLowerCase()}`, f);
  return [...m.values()];
}

function mergeAdvertisers(a: AdvertiserRecord[], b: AdvertiserRecord[]): AdvertiserRecord[] {
  const m = new Map<string, AdvertiserRecord>();
  for (const x of [...a, ...b]) m.set(`${x.platform}:${x.name.toLowerCase()}`, x);
  return [...m.values()];
}

function mergeInterests(a: PlatformInterestList[], b: PlatformInterestList[]): PlatformInterestList[] {
  const m = new Map<Platform, string[]>();
  for (const list of [...a, ...b]) {
    const cur = m.get(list.platform) ?? [];
    const lower = new Set(cur.map((s) => s.toLowerCase()));
    for (const i of list.interests) if (!lower.has(i.toLowerCase())) { lower.add(i.toLowerCase()); cur.push(i); }
    m.set(list.platform, cur);
  }
  return [...m.entries()].map(([platform, interests]) => ({ platform, interests }));
}

function hasAnyData(r: ParseResult): boolean {
  return r.events.length + r.follows.length + r.advertisers.length + r.interests.reduce((s, i) => s + i.interests.length, 0) > 0;
}

/** Recomputes Insights from everything stored (e.g. after the analysis code changes). */
export async function recomputeInsights(onProgress: Progress = () => {}, settings: DriftSettings = DEFAULT_SETTINGS): Promise<Insights | null> {
  const data = await store.readAll();
  if (data.events.length === 0) return null;
  const enriched = await enrichEvents(data.events, settings, onProgress);
  const events = applyEnriched(data.events, enriched);
  const base = await getClassifier(settings, onProgress);
  onProgress({ stage: 'classifying', message: 'Sorting what you watched into topics', fraction: 0 });
  const { insights } = await analyse(
    { ...data, events },
    trackingClassifier(base, events.length, onProgress),
  );
  tagClassifier(insights, base.name, settings);
  onProgress({ stage: 'saving', message: 'Saving your results on this device' });
  await store.putEvents(enriched);
  await store.saveInsights(insights);
  return insights;
}

/** Full import. Throws DriftImportError for problems the user can fix. */
function tagClassifier(insights: Insights, name: string, settings: DriftSettings): void {
  insights.classifier = name;
  if (settings.smartTopics && name !== 'ml-e5') {
    insights.classifierNote = `The topic model could not load${lastModelError ? ` (${lastModelError})` : ''}, so topics were sorted with keywords.`;
  }
}

/** Replaces events by id with their enriched versions. */
function applyEnriched(events: DriftEvent[], enriched: DriftEvent[]): DriftEvent[] {
  if (enriched.length === 0) return events;
  const byId = new Map(enriched.map((e) => [e.id, e]));
  return events.map((e) => byId.get(e.id) ?? e);
}

export async function runImport(inputs: UploadInput[], onProgress: Progress = () => {}, settings: DriftSettings = DEFAULT_SETTINGS): Promise<ImportRecord[]> {
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
  await yieldToEventLoop();
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

  // Merge with what is already stored (dedupe by event id), in memory, so nothing is written
  // unless analysis succeeds.
  const stored = await store.readAll();
  const seen = new Set(stored.events.map((e) => e.id));
  const fresh: DriftEvent[] = [];
  const perResultNew: number[] = results.map((r) => {
    let n = 0;
    for (const e of r.events) {
      if (!e || typeof e.id !== 'string' || seen.has(e.id)) continue;
      seen.add(e.id);
      fresh.push(e);
      n++;
    }
    return n;
  });
  const enriched = await enrichEvents(stored.events.concat(fresh), settings, onProgress);
  const events = applyEnriched(stored.events.concat(fresh), enriched);
  const freshIds = new Set(fresh.map((e) => e.id));
  const base = await getClassifier(settings, onProgress);
  const newFollows = results.flatMap((r) => r.follows);
  const newInterests = results.flatMap((r) => r.interests);
  const newAdvertisers = results.flatMap((r) => r.advertisers);

  // 4-5. classifying + analysing
  onProgress({ stage: 'classifying', message: 'Sorting what you watched into topics', fraction: 0 });
  await yieldToEventLoop();
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
  tagClassifier(insights, base.name, settings);

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
  await store.addEvents(events.filter((e) => freshIds.has(e.id)));
  await store.putEvents(enriched.filter((e) => !freshIds.has(e.id)));
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
