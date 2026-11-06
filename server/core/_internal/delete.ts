import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { withReelLock, workingState } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import { listRenders } from './past-renders.ts';
import { CLEANUP_RETRIES, CLEANUP_RETRY_MS } from './render.ts';
import { stateFilePath } from './state.ts';
import { readHandoff } from './handoff.ts';
import { newestVersionNumber, rememberVersionNumber, requireVersionDir } from './version.ts';

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS };

const readable = (file: string): Promise<boolean> => readFile(file).then(() => true, () => false);

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
    const files = [versionDir, stateFilePath(projectDir, slug, number), ...renders.flatMap((render) => [join(reelDir, 'renders', render.file), join(projectDir, 'output', slug, render.file)])];
    for (const file of files) if (await lstat(file).catch(() => null)) await localTarget(projectDir, file);
    await rememberVersionNumber(reelDir, number);
    await removeOwned(projectDir, [...new Set(files)]);
  });
}
