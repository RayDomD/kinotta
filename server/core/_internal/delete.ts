import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { withReelLock, workingState } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import { CLEANUP_RETRIES, CLEANUP_RETRY_MS } from './render.ts';
import { stateFilePath } from './state.ts';
import { readHandoff } from './handoff.ts';
import { SAVE_INTENT_FILE } from './save-journal.ts';
import { contentPlaybackPath, hashOf } from './import.ts';
import { newestVersionNumber, rememberVersionNumber, requireReelDir, requireVersionDir } from './version.ts';

const STAGE_PREFIX = '.delete-';
const STAGE_PATTERN = /^\.delete-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STALE_STAGE_MS = 60 * 60 * 1000;
const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS };

const readable = (file: string): Promise<boolean> => readFile(file).then(() => true, () => false);
const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const SOURCE_RECORDS = new Set(['plan.json', 'media.json', 'shots.json', 'edit-list.json', 'reel.json', '.media-library.json']);

const inside = (folder: string, file: string): boolean => {
  const path = relative(folder, file);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
};

/** Older authored pages and source plans can explicitly name files in another saved version/reel. Keep their originals. */
async function assertNoContentReferences(projectDir: string, deleted: string): Promise<void> {
  const target = resolve(deleted);
  async function visit(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (inside(target, resolve(file)) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !['renders', 'output', 'node_modules'].includes(entry.name)) await visit(file);
        continue;
      }
      if (!SOURCE_RECORDS.has(entry.name) && !['.html', '.css', '.js', '.mjs'].includes(extname(entry.name))) continue;
      const text = await readFile(file, 'utf8');
      const strings: string[] = [];
      if (extname(file) === '.json') {
        const collect = (value: unknown): void => {
          if (typeof value === 'string') strings.push(value);
          else if (value && typeof value === 'object') for (const child of Object.values(value)) collect(child);
        };
        try { collect(JSON.parse(text)); }
        catch { throw new KinottaError('invalid', `Cannot check content references in ${relative(projectDir, file)}. Repair it before deleting.`); }
      } else {
        for (const match of text.matchAll(/["'`]([^"'`\r\n]+)["'`]|url\(\s*([^\s)'"\r\n]+)\s*\)/g)) strings.push(match[1] ?? match[2]!);
      }
      const versionRoot = /^(.*[\\/]v\d+)(?:[\\/]|$)/.exec(dirname(file))?.[1];
      const bases = [dirname(file), projectDir, ...(versionRoot ? [versionRoot] : [])];
      if (strings.some((value) => !/^(?:[a-z]+:|#|\/\/)/i.test(value) || isAbsolute(value) ? bases.some((base) => inside(target, resolve(base, value.split(/[?#]/)[0]!))) : false)) {
        throw new KinottaError('frozen', `${relative(projectDir, file).split(sep).join('/')} references files being deleted. Keep them while that content depends on them.`);
      }
    }
  }
  await visit(projectDir);
}

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
      } else if (MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) hashes.add(await hashOf(file, projectDir, false));
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

async function versionRenders(projectDir: string, reelDir: string, slug: string, number: number): Promise<string[]> {
  const files: string[] = [];
  for (const folder of [join(reelDir, 'renders'), join(projectDir, 'output', slug)]) {
    const entries = await readdir(folder, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(`${slug}-`)) continue;
      const match = /^(?:working-)?v(\d+)-(?:[a-f0-9]{8}-)?(?:draft|final|overlay)-[^/\\]*$/.exec(entry.name.slice(slug.length + 1));
      if (match && Number(match[1]) === number) files.push(join(folder, entry.name));
    }
  }
  return files;
}

async function pruneEmpty(projectDir: string, folders: string[]): Promise<void> {
  for (const folder of folders) {
    if (!await lstat(folder).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; })) continue;
    await localTarget(projectDir, folder);
    await rmdir(folder).catch((error: NodeJS.ErrnoException) => { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) throw error; });
  }
}

/** Versions that would lose their plan. footage.ts lets older versions without a plan or sidecar inherit the nearest earlier one; the newest is counted too, because a version added later would inherit it. */
async function inheritedBy(reelDir: string, number: number): Promise<number[]> {
  const numbers = (await readdir(reelDir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^v[1-9]\d*$/.test(entry.name)).map((entry) => Number(entry.name.slice(1))).sort((a, b) => a - b);
  const dependents: number[] = [];
  let provider: number | undefined;
  for (const current of numbers) {
    const own = await readable(join(reelDir, `v${current}`, 'plan.json'));
    if (current !== number && !own && !await readable(join(reelDir, `v${current}`, 'media.json')) && provider === number) dependents.push(current);
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
  if (relative(resolve(root, relative(resolve(projectDir), resolve(file))), target) !== '') throw new KinottaError('invalid', 'Deletion cannot follow a symbolic link or junction.');
}

/** All preflights finish before mutation. Failed moves restore the original names before reporting the error. */
async function removeOwned(projectDir: string, files: string[]): Promise<void> {
  const existing: string[] = [];
  for (const file of files) {
    const info = await lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info) { await localTarget(projectDir, file); existing.push(file); }
  }
  const stage = join(resolve(projectDir), `${STAGE_PREFIX}${randomUUID()}`);
  const moved: Array<{ from: string; to: string }> = [];
  await mkdir(stage);
  try {
    for (const [index, file] of existing.entries()) {
      const to = join(stage, String(index));
      await renameWithRetry(file, to);
      moved.push({ from: file, to });
    }
  } catch (error) {
    const stuck: string[] = [];
    for (const file of moved.reverse()) {
      try { await renameWithRetry(file.to, file.from); }
      catch { stuck.push(relative(projectDir, file.from)); }
    }
    // A file that could not go back is still in the stage; removing the stage would lose it.
    if (stuck.length) {
      const kept = `${stage}-kept`;
      let keptStage = stage;
      let warning = '';
      try {
        await renameWithRetry(stage, kept);
        keptStage = kept;
      } catch {
        warning = ' Could not protect this folder from automatic cleanup; recover its files before opening the project again.';
      }
      throw new KinottaError('invalid', `Delete failed and could not put back ${stuck.join(', ')}. Its files are kept in ${relative(projectDir, keptStage)}.${warning}`);
    }
    await rm(stage, REMOVE_OPTIONS);
    throw error;
  }
  await localTarget(projectDir, stage);
  await rm(stage, REMOVE_OPTIONS);
}

const BUSY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

/** Windows holds a file briefly after a process closes it, so a busy rename is retried like the removal is. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(from, to); }
    catch (error) {
      if (attempt >= CLEANUP_RETRIES || !BUSY_CODES.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await new Promise((done) => setTimeout(done, CLEANUP_RETRY_MS));
    }
  }
}

/** A crash mid-delete leaves its staging folder. Remove old ones when a project opens; recent ones may belong to a live delete. */
// Sweeping runs only at project open; staging renames are assumed to take less than an hour.
export async function sweepStaleDeleteStages(projectDir: string, now = Date.now()): Promise<void> {
  const root = resolve(projectDir);
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !STAGE_PATTERN.test(entry.name)) continue;
    const folder = join(root, entry.name);
    const info = await lstat(folder).catch(() => null);
    if (!info?.isDirectory() || now - info.mtimeMs < STALE_STAGE_MS) continue;
    await localTarget(projectDir, folder);
    await rm(folder, REMOVE_OPTIONS);
  }
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
    if (await readable(join(reelDir, SAVE_INTENT_FILE))) throw new KinottaError('frozen', 'Save recovery is pending. Open Working to recover it before deleting a version.');
    const working = await workingState(reelDir);
    if (working.base === number || working.frozen === number) throw new KinottaError('frozen', `Current is built on v${number}. Choose another base before deleting it.`);
    if ([...working.operations, ...working.undo.flat(), ...working.redo.flat()].some((operation) => operation.kind === 'use-version' && operation.version === number)) throw new KinottaError('frozen', `An edit or Undo/Redo entry uses v${number}. Remove that reference before deleting it.`);
    const dependents = await inheritedBy(reelDir, number);
    if (dependents.length) throw new KinottaError('frozen', `${dependents.map((version) => `v${version}`).join(', ')} inherit the plan from v${number}. Keep it while those versions depend on it.`);
    await assertNoContentReferences(projectDir, versionDir);
    const files = [versionDir, stateFilePath(projectDir, slug, number), ...await versionRenders(projectDir, reelDir, slug, number), ...await unusedCaches(projectDir, versionDir)];
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
    await assertNoContentReferences(projectDir, reelDir);
    const files = [reelDir, join(projectDir, 'output', slug), ...await unusedCaches(projectDir, reelDir)];
    await removeOwned(projectDir, files);
    await pruneEmpty(projectDir, [join(projectDir, 'footage', '.playback'), join(projectDir, 'reels', '.kinotta', 'stills'), join(projectDir, 'reels', '.kinotta'), join(projectDir, 'output'), join(projectDir, 'reels')]);
  });
}
