import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { readPendingMedia } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import { mediaMixArgs } from './media-render.ts';
import type { MediaPlan } from './media-model.ts';
import { mixPeaks } from './runner.ts';
export { describeOverload } from './media-audio.ts';
import type { MixOverload, OverloadSpan } from './types.ts';
import { readVersion } from './carry.ts';
import { requireVersionDir } from './approval.ts';

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/** Seconds per measuring window: spans are reported to this precision. */
const WINDOW_SECONDS = 0.01;
/** Full scale. The mix is summed without limiting (AM38), so a peak above this clips in the output. */
const FULL_SCALE = 1;
/** Rounding of reported times and peaks, so a report reads the same each time. */
const PRECISION = 1000;
const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;

/** Where a mix passes full scale: neighbouring overloaded windows join into one span, with its highest peak. */
export async function measureOverload(media: MediaPlan, planDir: string, duration: number): Promise<MixOverload> {
  const args = mediaMixArgs(media, planDir, duration, WINDOW_SECONDS);
  if (args === null) return { spans: [] };
  const spans: OverloadSpan[] = [];
  (await mixPeaks(args)).forEach((peak, window) => {
    if (peak <= FULL_SCALE) return;
    const start = window * WINDOW_SECONDS;
    const last = spans.at(-1);
    if (last !== undefined && Math.abs(last.end - start) < WINDOW_SECONDS / 2) {
      last.end = start + WINDOW_SECONDS;
      last.peak = Math.max(last.peak, peak);
    } else spans.push({ start, end: start + WINDOW_SECONDS, peak });
  });
  return { spans: spans.map((span) => ({ start: round(span.start), end: round(span.end), peak: round(span.peak) })) };
}

/**
 * A reel's mix overload: a saved version's, or with no version the pending one Save would preserve. A reel with no native
 * media has nothing to measure. A saved version is measured from its own preserved plan, as its render is.
 */
export async function mixOverload(projectDir: string, slug: string, version?: number): Promise<MixOverload> {
  if (version === undefined) {
    const pending = await readPendingMedia(projectDir, slug);
    return pending === null ? { spans: [] } : measureOverload(pending.media, pending.planDir, pending.duration);
  }
  const { versionDir } = await requireVersionDir(projectDir, slug, version);
  const saved = await readVersion(projectDir, slug, version);
  if (!saved.media || saved.media.legacy) return { spans: [] };
  if (!(await exists(join(versionDir, 'plan.json'))) && !(await exists(join(versionDir, 'media.json')))) {
    throw new KinottaError('invalid', `v${version} has no preserved media plan to measure.`);
  }
  return measureOverload(saved.media, versionDir, saved.duration);
}
