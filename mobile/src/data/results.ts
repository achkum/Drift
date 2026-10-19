// Computed-results export, same payload as the web app's exportResults (never raw events).
import * as store from './store';

export const EXPORT_FORMAT_VERSION = 1;

export async function exportResultsJson(): Promise<string> {
  const [insights, imports] = await Promise.all([store.loadInsights(), store.getAllImports()]);
  const payload = {
    app: 'drift',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    note: 'Computed results only. Your raw watch, search and ad history is not included.',
    // Strip per-item titles and links so the file holds only aggregate results.
    insights: insights && {
      ...insights,
      topics: Object.fromEntries(Object.entries(insights.topics ?? {}).map(([k, t]) => [k, { ...t, recentItems: [] }])),
    },
    imports: imports.map((r) => ({
      id: r.id, platform: r.platform, importedAt: r.importedAt, fileName: r.fileName,
      events: r.events, newEvents: r.newEvents, warnings: r.warnings,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
