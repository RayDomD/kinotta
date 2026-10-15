import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { hashOf } from './import.ts';
import { mediaFile } from './media-library.ts';
import { footageFile } from './footage.ts';
import { KinottaError } from './errors.ts';
import { extractMediaStill, probeMedia } from './runner.ts';
import { serialized } from './state.ts';

/** Keep a shelf of thumbnails from starting dozens of encoders at once. */
let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try { return await task(); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export async function mediaStill(dir: string, source: string, time: number, width: number, saved?: { reel: string; version: number }, footageReel?: string): Promise<string> {
  if (!Number.isFinite(time) || time < 0 || !Number.isInteger(width) || width < 32 || width > 640) throw new KinottaError('invalid', 'Choose a valid still time and a width from 32 to 640 pixels.');
  return limited(async () => {
    const file = footageReel ? await footageFile(dir, footageReel) : await mediaFile(dir, source, saved);
    if (!file) throw new KinottaError('not-found', 'This video is unavailable.');
    const info = await probeMedia(file, 'video');
    if (time >= info.duration) throw new KinottaError('invalid', 'The still is past the end of the video.');
    const hash = await hashOf(file);
    const folder = join(dir, 'reels', '.kinotta', 'stills', hash);
    const at = Math.floor(time * 1000) / 1000;
    const target = join(folder, `${at}-${width}.jpg`);
    return serialized(target, async () => {
      if (await stat(target).then((value) => value.size > 0, () => false)) return target;
      await mkdir(folder, { recursive: true });
      const temporary = join(folder, `${randomUUID()}.jpg`);
      try { await extractMediaStill(file, temporary, at, width); await rename(temporary, target); }
      finally { await rm(temporary, { force: true }); }
      return target;
    });
  });
}
