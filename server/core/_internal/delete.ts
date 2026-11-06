import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { withReelLock, workingState } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import { listRenders } from './past-renders.ts';
import { CLEANUP_RETRIES, CLEANUP_RETRY_MS } from './render.ts';
import { stateFilePath } from './state.ts';
import { readHandoff } from './handoff.ts';
import { contentPlaybackPath, hashOf } from './import.ts';
import { newestVersionNumber, rememberVersionNumber, requireReelDir, requireVersionDir } from './version.ts';

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS };

const readable = (file: string): Promise<boolean> => readFile(file).then(() => true, () => false);
const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const SOURCE_RECORDS = new Set(['plan.json', 'media.json', 'shots.json', 'edit-list.json', 'reel.json', '.media-library.json']);

/** Read identities without creating hash memoization files or starting any media tools. */
async function contentHashes(projectDir: string, root: string, excluded: Set<string>): Promise<Set<string>> {
  const hashes = new Set<string>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('contentHash' in value && typeof value.contentHash === 'string' && /^[a-f0-9]{64}$/.test(value.contentHash)) hashes.add(value.contentHash);
    for (const child of Object.values(value)) collect(child);
  };
  async function visit(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (excluded.has(resolve(file))) continue;
      if (entry.isSymbolicLink()) throw new KinottaError('invalid', 'Content references through symbolic links must be resolved before deletion.');
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !['renders', 'output', 'node_modules'].includes(entry.name)) await visit(file);
      } else if (SOURCE_RECORDS.has(entry.name)) {
        try { collect(JSON.parse(await readFile(file, 'utf8'))); }
        catch { throw new KinottaError('invalid', `Cannot check content references in ${relative(projectDir, file)}. Repair it before deleting.`); }
      } else if (MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) hashes.add(await hashOf(file));
    }
  }
  await visit(root);
  return hashes;
}

async function unusedCaches(projectDir: string, deleted: string): Promise<string[]> {
  const removed = await contentHashes(projectDir, deleted, new Set());
  const retained = await contentHashes(projectDir, projectDir, new Set([resolve(deleted)]));
  return [...removed].filter((hash) => !retained.has(hash)).flatMap((hash) => [contentPlaybackPath(projectDir, hash), join(projectDir, 'reels', '.kinotta', 'stills', hash)]);
}

async function pruneEmpty(projectDir: string, folders: string[]): Promise<void> {
  for (const folder of folders) {
    if (!await lstat(folder).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; })) continue;
    await localTarget(projectDir, folder);
    await rmdir(folder).catch((error: NodeJS.ErrnoException) => { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) throw error; });
  }
}

/** Match footage.ts's implicit fallback exactly: only older versions without their own plan/sidecar inherit. */
async function inheritedBy(reelDir: string, number: number): Promise<number[]> {
  const numbers = (await readdir(reelDir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^v[1-9]\d*$/.test(entry.name)).map((entry) => Number(entry.name.slice(1))).sort((a, b) => a - b);
  const dependents: number[] = [];
  let provider: number | undefined;
  for (const current of numbers) {
    const own = await readable(join(reelDir, `v${current}`, 'plan.json'));
    if (current !== number && current !== numbers.at(-1) && !own && !await readable(join(reelDir, `v${current}`, 'media.json')) && provider === number) dependents.push(current);
    if (own) provider = current;
  }
  return dependents;
}

/** Check resolved targets before any recursive removal; links cannot redirect a delete out of the project. */
async function localTarget(projectDir: string, file: string): Promise<void> {
  const root = await realpath(projectDir);
  const target = await realpath(file);
  const path = relative(root, target);
  if (!path || isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) throw new KinottaError('invalid', 'Deletion must stay inside the project folder.');
}

/** All preflights finish before mutation. Failed moves restore the original names before reporting the error. */
async function removeOwned(projectDir: string, files: string[]): Promise<void> {
  const existing: string[] = [];
  for (const file of files) {
    const info = await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info) { await localTarget(projectDir, file); existing.push(file); }
  }
  const stage = join(resolve(projectDir), `.delete-${randomUUID()}`);
  const moved: Array<{ from: string; to: string }> = [];
  await mkdir(stage);
  try {
    for (const [index, file] of existing.entries()) {
      const to = join(stage, String(index));
      await rename(file, to);
      moved.push({ from: file, to });
    }
  } catch (error) {
    for (const file of moved.reverse()) await rename(file.to, file.from);
    throw error;
  } finally {
    if (moved.length !== existing.length) await rm(stage, REMOVE_OPTIONS);
  }
  await localTarget(projectDir, stage);
  await rm(stage, REMOVE_OPTIONS);
}

async function assertNoHandoff(reelDir: string): Promise<void> {
  if (await readHandoff(reelDir, await newestVersionNumber(reelDir))) throw new KinottaError('frozen', 'A comment batch is handed off for this reel. End the handoff before deleting it or a version.');
}

export async function deleteVersion(projectDir: string, slug: string, number: number, assertIdle: () => Promise<void>): Promise<void> {
  await assertIdle();
  const { reelDir } = await requireVersionDir(projectDir, slug, number);
  await withReelLock(reelDir, async () => {
    const { versionDir } = await requireVersionDir(projectDir, slug, number);
    await assertIdle();
    await assertNoHandoff(reelDir);
    const working = await workingState(reelDir);
    if (working.base === number || working.frozen === number) throw new KinottaError('frozen', `Current is built on v${number}. Choose another base before deleting it.`);
    if ([...working.operations, ...working.undo.flat(), ...working.redo.flat()].some((operation) => operation.kind === 'use-version' && operation.version === number)) throw new KinottaError('frozen', `An edit or Undo/Redo entry uses v${number}. Remove that reference before deleting it.`);
    const dependents = await inheritedBy(reelDir, number);
    if (dependents.length) throw new KinottaError('frozen', `${dependents.map((version) => `v${version}`).join(', ')} inherit the plan from v${number}. Keep it while those versions depend on it.`);
    const renders = (await listRenders(projectDir, slug)).filter((render) => render.version === number);
    const files = [versionDir, stateFilePath(projectDir, slug, number), ...renders.flatMap((render) => [join(reelDir, 'renders', render.file), join(projectDir, 'output', slug, render.file)]), ...await unusedCaches(projectDir, versionDir)];
    for (const file of files) if (await lstat(file).catch(() => null)) await localTarget(projectDir, file);
    await rememberVersionNumber(reelDir, number);
    await removeOwned(projectDir, [...new Set(files)]);
  });
}

export async function deleteReel(projectDir: string, slug: string, openReel: string, assertIdle: () => Promise<void>): Promise<void> {
  if (typeof openReel !== 'string' || !openReel.trim()) throw new KinottaError('invalid', 'Name the open reel before deleting another reel.');
  if (slug === openReel) throw new KinottaError('frozen', 'The open reel cannot be deleted. Open another reel first.');
  const reelDir = await requireReelDir(projectDir, slug);
  await assertIdle();
  await withReelLock(reelDir, async () => {
    await requireReelDir(projectDir, slug);
    await assertIdle();
    await assertNoHandoff(reelDir);
    await localTarget(projectDir, reelDir);
    const files = [reelDir, join(projectDir, 'output', slug), ...await unusedCaches(projectDir, reelDir)];
    await removeOwned(projectDir, files);
    await pruneEmpty(projectDir, [join(projectDir, 'footage', '.playback'), join(projectDir, 'reels', '.kinotta', 'stills'), join(projectDir, 'reels', '.kinotta'), join(projectDir, 'output'), join(projectDir, 'reels')]);
  });
}
