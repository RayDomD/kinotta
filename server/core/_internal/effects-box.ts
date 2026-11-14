import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { effectsCatalogue } from './effects-catalogue.ts';
import { KinottaError } from './errors.ts';
import { serialized, writeFileAtomic } from './state.ts';

const fileFor = (dir: string): string => join(dir, 'reels', '.kinotta', 'effects-box.json');

/** Keeps the first copy of each id, in order, and drops ids the catalogue no longer has. */
async function known(ids: string[]): Promise<string[]> {
  const catalogue = new Set((await effectsCatalogue()).map((effect) => effect.id));
  return [...new Set(ids)].filter((id) => catalogue.has(id));
}

/** The effect ids the owner chose for the Effects box, in the order added. A new project's box is empty. */
export async function effectsBox(dir: string): Promise<string[]> {
  const text = await readFile(fileFor(dir), 'utf8').catch((err: NodeJS.ErrnoException) => { if (err.code === 'ENOENT') return '[]'; throw err; });
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new KinottaError('invalid', 'The saved Effects box could not be read.'); }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) throw new KinottaError('invalid', 'The saved Effects box could not be read.');
  return known(parsed as string[]);
}

export async function saveEffectsBox(dir: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new KinottaError('invalid', 'The Effects box is a list of effect ids.');
  const kept = await known(ids as string[]);
  const file = fileFor(dir);
  return serialized(file, async () => { await writeFileAtomic(file, JSON.stringify(kept)); return kept; });
}
