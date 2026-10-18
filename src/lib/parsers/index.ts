// OWNER: parsers agent. Entry point for all export parsers.
import type { ExportFile, ExportParser, ParseResult } from '@/lib/types';
import { instagramParser } from './instagram';
import { tiktokParser } from './tiktok';
import { youtubeParser } from './youtube';

export const parsers: ExportParser[] = [youtubeParser, tiktokParser, instagramParser];

/** Parsers whose detect() matches any of the files. */
export function detectParsers(files: ExportFile[]): ExportParser[] {
  return parsers.filter((p) => p.detect(files));
}

/** Run every matching parser. Empty array when nothing matches. */
export async function parseExport(files: ExportFile[]): Promise<ParseResult[]> {
  return Promise.all(
    detectParsers(files).map(async (p) => {
      try {
        return await p.parse(files);
      } catch (err) {
        // Parsers are written not to throw; this is a last line of defence for one bad export.
        return {
          platform: p.id,
          events: [],
          follows: [],
          interests: [],
          advertisers: [],
          warnings: [`${p.label} export could not be read: ${err instanceof Error ? err.message : String(err)}`],
          filesUsed: [],
        } satisfies ParseResult;
      }
    }),
  );
}

export { exportGuides } from './guides';
export { youtubeParser, tiktokParser, instagramParser };
