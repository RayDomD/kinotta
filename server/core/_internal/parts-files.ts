import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { checkRevisionDependencies } from './graphic-preservation.ts';
import { checkPartsManifest } from './parts.ts';
import type { PartsInputs } from './parts-assembler.ts';
import type { PartsManifest } from './types.ts';

/** The authored root manifest is the input to build; only Kinotta writes version pages. */
export async function readAuthoredParts(reelDir: string): Promise<PartsManifest> {
  let value: unknown;
  try { value = JSON.parse(await readFile(join(reelDir, 'shots.json'), 'utf8')); }
  catch { throw new KinottaError('invalid', 'The authored parts manifest, shots.json in the reel folder, is missing or unreadable.'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).contract !== 2) throw new KinottaError('invalid', 'The authored shots.json must be a contract 2 parts manifest.');
  const checked = checkPartsManifest(value as Record<string, unknown>);
  if (!checked.manifest) throw new KinottaError('invalid', checked.issues.map((issue) => `${issue.message} [${issue.code}]`).join('\n'));
  return checked.manifest;
}

/** Revision text is read once before pure assembly, in manifest order. No revision is copied or rewritten. */
export async function readPartsInputs(reelDir: string, manifest: PartsManifest): Promise<PartsInputs> {
  const text = async (path: string): Promise<string> => {
    try { return await readFile(join(reelDir, path), 'utf8'); }
    catch { throw new KinottaError('invalid', `Parts revision file ${path} is missing or unreadable.`); }
  };
  const shared = { [manifest.shared]: { css: await text(`shared/${manifest.shared}/shared.css`) } };
  await checkRevisionDependencies(join(reelDir, 'shared', manifest.shared), ['shared.css']);
  const revisions = manifest.shots.flatMap((shot) => [...new Set([shot.revision, ...(shot.alternates ?? []).map((alternate) => alternate.revision)])].map((revision) => ({ name: shot.name, revision })));
  const entries = await Promise.all(revisions.map(async (shot) => {
    const base = `shots/${shot.name}/${shot.revision}`;
    const [html, css, js] = await Promise.all([text(`${base}/shot.html`), text(`${base}/shot.css`), text(`${base}/shot.js`)]);
    await checkRevisionDependencies(join(reelDir, base), ['shot.html', 'shot.css', 'shot.js']);
    return [`${shot.name}/${shot.revision}`, { html, css, js }] as const;
  }));
  return { shared, shots: Object.fromEntries(entries) };
}

/** Hash complete revision folders, including assets, without copying unchanged shots into a version. */
export async function partsRevisionHashes(reelDir: string, manifest: PartsManifest): Promise<Record<string, string>> {
  const folders = [`shared/${manifest.shared}`, ...manifest.shots.flatMap((shot) => [...new Set([shot.revision, ...(shot.alternates ?? []).map((alternate) => alternate.revision)])].map((revision) => `shots/${shot.name}/${revision}`))];
  const hashes: Record<string, string> = {};
  for (const folder of folders) {
    const hash = createHash('sha256');
    async function visit(path: string): Promise<void> {
      const entries = (await readdir(join(reelDir, folder, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const entry of entries) {
        const file = path ? `${path}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new KinottaError('invalid', `Parts revision ${folder}/${file} cannot contain a symbolic link.`);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile()) {
          const bytes = await readFile(join(reelDir, folder, file));
          hash.update(JSON.stringify([file, bytes.length]));
          hash.update(bytes);
        }
      }
    }
    await visit('');
    hashes[folder] = hash.digest('hex');
  }
  return hashes;
}

export function assertPartsHashes(expected: Record<string, string>, actual: Record<string, string>): void {
  for (const [folder, hash] of Object.entries(actual)) {
    if (expected[folder] !== undefined && expected[folder] !== hash) throw new KinottaError('invalid', `Parts revision ${folder} changed after publication. Write a new revision instead.`);
  }
}

/** Even a revision absent from the latest manifest may already belong to an older frozen version. */
export async function assertPublishedPartsUnchanged(reelDir: string, actual: Record<string, string>): Promise<void> {
  for (const entry of await readdir(reelDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^v[1-9]\d*$/.test(entry.name)) continue;
    const file = JSON.parse(await readFile(join(reelDir, entry.name, 'shots.json'), 'utf8')) as PartsManifest;
    if (file.contract === 2 && file.revisionHashes) assertPartsHashes(file.revisionHashes, actual);
  }
}
