// OWNER: parsers agent. Test helpers (node only): load a fixture folder as ExportFile[].
import fs from 'node:fs';
import path from 'node:path';
import type { ExportFile } from '@/lib/types';

const FIXTURES = path.join(__dirname, '__fixtures__');

/** All files under __fixtures__/<name>, with archive-style paths relative to that folder. */
export function loadFixture(name: string): ExportFile[] {
  const root = path.join(FIXTURES, name);
  const out: ExportFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const rel = path.relative(root, full).split(path.sep).join('/');
        out.push({ path: rel, text: async () => fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** In-memory ExportFile. */
export function memFile(p: string, content: string): ExportFile {
  return { path: p, text: async () => content };
}
