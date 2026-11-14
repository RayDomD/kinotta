import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { probeVideo } from './runner.ts';
import type { VideoEntry } from './types.ts';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);
const SKIPPED_FOLDERS = new Set(['node_modules', 'reels']);

/** A reel's title from its video's file name: "launch-day_v2.mp4" gives "launch day v2". */
export function titleFromFile(file: string): string {
  const name = basename(file, extname(file)).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name === '' ? 'Untitled reel' : name;
}

/** A path with forward slashes, whatever the platform. */
export const posix = (path: string): string => path.split(sep).join('/');

export const isVideoFile = (file: string): boolean => VIDEO_EXTENSIONS.has(extname(file).toLowerCase());

async function videoFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !SKIPPED_FOLDERS.has(entry.name)) found.push(...(await videoFiles(path)));
    } else if (entry.isFile() && isVideoFile(entry.name)) found.push(path);
  }
  return found;
}

/** The project's videos (outside reels/), by path, each probed. A file that cannot be probed is left out. */
export async function listVideos(projectDir: string): Promise<VideoEntry[]> {
  const files = (await videoFiles(projectDir)).sort();
  const entries = await Promise.all(
    files.map(async (file): Promise<VideoEntry | null> => {
      try {
        const probe = await probeVideo(file);
        const path = posix(relative(projectDir, file));
        return { path, name: basename(file), suggestedTitle: titleFromFile(file), ...probe, size: (await stat(file)).size };
      } catch {
        return null;
      }
    }),
  );
  return entries.filter((e): e is VideoEntry => e !== null);
}
