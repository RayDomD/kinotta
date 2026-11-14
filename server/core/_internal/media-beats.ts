import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { writeJsonAtomic } from './edit-list.ts';
import { hashOf } from './import.ts';
import { mediaFile } from './media-library.ts';
import { validateBeats } from './media-model.ts';
import type { BeatGrid } from './media-model.ts';
import { detectAudioBeats, probeMedia } from './runner.ts';

/** Cache by exact source bytes, with concurrent requests sharing one local analysis. Save freezes the returned grid. */
export function createMediaBeats(projectDir: string) {
  const jobs = new Map<string, Promise<BeatGrid>>();
  return async (source: string, saved?: { reel: string; version: number }, fresh = false): Promise<BeatGrid> => {
    const file = await mediaFile(projectDir, source, saved, true);
    if (!file) throw new KinottaError('invalid', 'The original source is missing or changed. Relink it before detecting beats.');
    const hash = await hashOf(file);
    const running = jobs.get(hash);
    if (running) return running;
    const analyze = async () => {
      const cacheDir = join(projectDir, 'footage', '.beats');
      const cache = join(cacheDir, `${hash}.json`);
      const duration = (await probeMedia(file, 'audio')).duration;
      if (!fresh) {
        const text = await readFile(cache, 'utf8').catch(() => null);
        if (text !== null) {
          try { const grid = JSON.parse(text) as BeatGrid; validateBeats(grid, duration); return grid; }
          catch { /* A corrupt cache is replaced by analysis of the verified bytes. */ }
        }
      }
      const grid = await detectAudioBeats(file);
      validateBeats(grid, duration);
      await mkdir(cacheDir, { recursive: true });
      await writeJsonAtomic(cache, grid);
      return grid;
    };
    const job = analyze().finally(() => jobs.delete(hash));
    jobs.set(hash, job);
    return job;
  };
}
