import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EDITS_CSS, readEditsCss } from './code-edits.ts';

/** Object order and publication metadata do not change the reel's content. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Exact captured page, plan, transcript, offsets and dependency bytes, independent of history. */
export async function contentIdentity(dir: string): Promise<string> {
  const hash = createHash('sha256');
  const ignored = new Set(['edits.json', 'approval.json', EDITS_CSS]);
  async function visit(folder: string, prefix = ''): Promise<void> {
    const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!prefix && (ignored.has(entry.name) || /^comments(?:-.*)?\.json$/.test(entry.name))) continue;
      const name = `${prefix}${entry.name}`;
      const file = join(folder, entry.name);
      if (entry.isDirectory()) { await visit(file, `${name}/`); continue; }
      hash.update(`${name}\0`);
      if (!prefix && entry.name === 'shots.json') {
        const { builtBy: _by, changedSections: _sections, frozenBy: _frozen, ...content } = JSON.parse(await readFile(file, 'utf8'));
        hash.update(JSON.stringify(canonical(content)));
      } else if (!prefix && entry.name === 'index.html') {
        hash.update((await readFile(file, 'utf8')).replace(/<link rel="stylesheet" href="kinotta-edits\.css">\n?/g, ''));
      } else if (!prefix && (entry.name === 'plan.json' || entry.name === 'transcript.json' || entry.name === 'media.json')) {
        hash.update(JSON.stringify(canonical(JSON.parse(await readFile(file, 'utf8')))));
      } else {
        for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
      }
      hash.update('\0');
    }
  }
  await visit(dir);
  hash.update(JSON.stringify(canonical(await readEditsCss(dir))));
  return hash.digest('hex');
}
