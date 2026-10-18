// OWNER: parsers agent. Entry point for all export parsers.
import type { ExportFile, ExportParser, ParseResult } from '@/lib/types';

export const parsers: ExportParser[] = [];

/** Parsers whose detect() matches any of the files. */
export function detectParsers(files: ExportFile[]): ExportParser[] {
  return parsers.filter((p) => p.detect(files));
}

/** Run every matching parser. Empty array when nothing matches. */
export async function parseExport(files: ExportFile[]): Promise<ParseResult[]> {
  return Promise.all(detectParsers(files).map((p) => p.parse(files)));
}
