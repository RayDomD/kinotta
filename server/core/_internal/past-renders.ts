import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { OUTPUT_DIR, RENDERS_DIR } from './render.ts';
import { revealInFolder } from './runner.ts';
import type { RenderFile, RenderPreset } from './types.ts';
import { requireReelDir } from './version.ts';

/** `<reel>-v<n>-<preset>-…`: the version and preset a render was named with (R7). */
const RENDER_NAME = /-(?:(working)-)?v(\d+)-(?:[a-f0-9]{8}-)?(draft|final|overlay)-[^/\\]*$/;

/** A reel's finished renders, newest first. Temp files and work folders (dot names) are left out. */
export async function listRenders(projectDir: string, slug: string): Promise<RenderFile[]> {
  const reelDir = await requireReelDir(projectDir, slug);
  const dirs = [join(projectDir, OUTPUT_DIR, slug), join(reelDir, RENDERS_DIR)];
  const files = (await Promise.all(dirs.map(async (dir) => {
    const names = await readdir(dir).catch(() => [] as string[]);
    return Promise.all(
      names.filter((name) => !name.startsWith('.')).map(async (name): Promise<RenderFile | null> => {
        const info = await stat(join(dir, name)).catch(() => null);
        const match = RENDER_NAME.exec(name);
        if (info === null || !info.isFile() || match === null) return null;
        return { file: name, version: Number(match[2]), preset: match[3] as RenderPreset, ...(match[1] ? { working: true as const } : {}), bytes: info.size, at: info.mtime.toISOString() };
      }),
    );
  }))).flat();
  // Output entries come first, matching renderPath's priority for duplicate names.
  const unique = new Map<string, RenderFile>();
  for (const file of files) {
    if (file !== null && !unique.has(file.file)) unique.set(file.file, file);
  }
  return [...unique.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** The path of one of a reel's finished renders. Throws `not-found` for an unknown reel or file, or a name that isn't one. */
export async function renderPath(projectDir: string, slug: string, file: string): Promise<string> {
  const reelDir = await requireReelDir(projectDir, slug);
  if (!file.startsWith('.') && !/[\\/]/.test(file)) {
    for (const dir of [join(projectDir, OUTPUT_DIR, slug), join(reelDir, RENDERS_DIR)]) {
      const path = join(dir, file);
      if (await stat(path).then((info) => info.isFile(), () => false)) return path;
    }
  }
  throw new KinottaError('not-found', `Render "${file}" of reel "${slug}" not found.`);
}

/** Shows a finished render in the system's file manager. Throws `not-found` as `renderPath` does. */
export async function revealRender(projectDir: string, slug: string, file: string): Promise<void> {
  revealInFolder(await renderPath(projectDir, slug, file));
}
