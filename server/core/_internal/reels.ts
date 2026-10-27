import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { agentTold } from './direction.ts';
import { briefRequest } from './requests.ts';
import { readReelStyle } from './style.ts';
import type { ReelListing, ReelSummary } from './types.ts';

const REELS_DIR = 'reels';
const REEL_FILE = 'reel.json';
const VERSION_DIR = /^v(\d+)$/;

async function readDirs(dir: string): Promise<string[] | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw err;
  }
}

/** Newest mtime of any file inside dir (the folder's own mtime when it holds no files). */
async function newestMtime(dir: string): Promise<number> {
  let newest = 0;
  let sawFile = false;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await newestMtime(path);
      if (inner > 0) {
        sawFile = true;
        newest = Math.max(newest, inner);
      }
    } else {
      try {
        const modified = (await stat(path)).mtimeMs;
        sawFile = true;
        newest = Math.max(newest, modified);
      } catch (error) {
        // An atomic writer may rename a temporary file after readdir.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  return sawFile ? newest : (await stat(dir)).mtimeMs;
}

export async function readTitle(reelDir: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, REEL_FILE), 'utf8')) as { title?: unknown };
    return typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : null;
  } catch {
    return null;
  }
}

/** The brief a reel was started from, or null for a reel that was not. */
async function readBrief(reelDir: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(join(reelDir, REEL_FILE), 'utf8')) as { brief?: unknown };
    return typeof parsed.brief === 'string' && parsed.brief.trim() ? parsed.brief : null;
  } catch {
    return null;
  }
}

async function summarize(reelsDir: string, slug: string): Promise<ReelSummary> {
  const reelDir = join(reelsDir, slug);
  const versions = (await readDirs(reelDir))!
    .map((name) => VERSION_DIR.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  const title = (await readTitle(reelDir)) ?? slug;
  const brief = await readBrief(reelDir);
  const metadata = await readFile(join(reelDir, REEL_FILE), 'utf8').then((text) => JSON.parse(text) as { made?: unknown }).catch(() => null);
  const made = metadata?.made === 'auto' || metadata?.made === 'direct' ? metadata.made : undefined;
  // A brief reel's request carries its style, as when it was started; an unreadable style leaves it out.
  const style = brief === null ? null : await readReelStyle(dirname(reelsDir), slug).catch(() => null);
  return {
    slug,
    title,
    newestVersion: versions.length ? Math.max(...versions) : null,
    lastChange: await newestMtime(reelDir),
    ...(made !== undefined ? { made } : {}),
    ...(brief !== null ? { brief: { text: brief, request: briefRequest(slug, title, brief, style ? agentTold(style) : undefined) } } : {}),
  };
}

export async function listReels(projectDir: string): Promise<ReelListing> {
  const reelsDir = join(projectDir, REELS_DIR);
  const slugs = await readDirs(reelsDir);
  if (slugs === null) return { state: 'no-reels-folder', reels: [] };
  if (slugs.length === 0) return { state: 'no-reels', reels: [] };
  const reels = await Promise.all(slugs.map((slug) => summarize(reelsDir, slug)));
  reels.sort((a, b) => b.lastChange - a.lastChange || a.slug.localeCompare(b.slug));
  return { state: 'ok', reels };
}
