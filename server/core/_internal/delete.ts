import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { withReelLock } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import { listRenders } from './past-renders.ts';
import { CLEANUP_RETRIES, CLEANUP_RETRY_MS } from './render.ts';
import { stateFilePath } from './state.ts';
import { rememberVersionNumber, requireVersionDir } from './version.ts';

const REMOVE_OPTIONS = { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_MS };

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

export async function deleteVersion(projectDir: string, slug: string, number: number): Promise<void> {
  const { reelDir } = await requireVersionDir(projectDir, slug, number);
  await withReelLock(reelDir, async () => {
    const { versionDir } = await requireVersionDir(projectDir, slug, number);
    const renders = (await listRenders(projectDir, slug)).filter((render) => render.version === number);
    const files = [versionDir, stateFilePath(projectDir, slug, number), ...renders.flatMap((render) => [join(reelDir, 'renders', render.file), join(projectDir, 'output', slug, render.file)])];
    for (const file of files) if (await lstat(file).catch(() => null)) await localTarget(projectDir, file);
    await rememberVersionNumber(reelDir, number);
    await removeOwned(projectDir, [...new Set(files)]);
  });
}
