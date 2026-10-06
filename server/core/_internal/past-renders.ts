import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { RENDERS_DIR } from './render.ts';
import { revealInFolder } from './runner.ts';
import type { RenderFile, RenderPreset } from './types.ts';
import { requireReelDir } from './version.ts';

/** `<reel>-v<n>-<preset>-…`: the version and preset a render was named with (R7). */
const RENDER_NAME = /-v(\d+)-(draft|final|overlay)-[^/\\]*$/;

/** A reel's finished renders, newest first. Temp files and work folders (dot names) are left out. */
export async function listRenders(projectDir: string, slug: string): Promise<RenderFile[]> {
  const dir = join(await requireReelDir(projectDir, slug), RENDERS_DIR);
  const names = await readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names.filter((name) => !name.startsWith('.')).map(async (name): Promise<RenderFile | null> => {
      const info = await stat(join(dir, name)).catch(() => null);
      const match = RENDER_NAME.exec(name);
      if (info === null || !info.isFile() || match === null) return null;
      return { file: name, version: Number(match[1]), preset: match[2] as RenderPreset, bytes: info.size, at: info.mtime.toISOString() };
    }),
  );
  return files.filter((file): file is RenderFile => file !== null).sort((a, b) => b.at.localeCompare(a.at));
}

/** The path of one of a reel's finished renders. Throws `not-found` for an unknown reel or file, or a name that isn't one. */
export async function renderPath(projectDir: string, slug: string, file: string): Promise<string> {
  const dir = join(await requireReelDir(projectDir, slug), RENDERS_DIR);
  const path = join(dir, file);
  const isRender = !file.startsWith('.') && !/[\\/]/.test(file) && (await stat(path).then((s) => s.isFile(), () => false));
  if (!isRender) throw new KinottaError('not-found', `Render "${file}" of reel "${slug}" not found.`);
  return path;
}

/** Shows a finished render in the system's file manager. Throws `not-found` as `renderPath` does. */
export async function revealRender(projectDir: string, slug: string, file: string): Promise<void> {
  revealInFolder(await renderPath(projectDir, slug, file));
}
