import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readPendingMedia } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import { gradeFilters, validateGrade, type Grade } from './grade.ts';
import { hashOf, inCopySlot } from './import.ts';
import { mediaFile } from './media-library.ts';
import { cachedMediaStill } from './media-stills.ts';
import type { MediaPlan } from './media-model.ts';
import { makeGradedPlayback } from './runner.ts';
import { requireVersionDir } from './version.ts';

export interface PreviewVersion { version: number; working?: boolean }
export type GradedPlayback = { status: 'rendering' } | { file: string; offset: number };
const building = new Map<string, Promise<void>>();
const failures = new Map<string, unknown>();
const exists = (file: string) => stat(file).then((value) => value.size > 0, () => false);
const DELIVERY_WIDTH = 1920;
const exportConversion = 'format=rgba,format=yuv420p';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function placementSource(dir: string, reel: string, id: string, context: PreviewVersion) {
  if (!Number.isInteger(context.version) || context.version < 1) throw new KinottaError('invalid', 'Choose a valid version.');
  let media: MediaPlan | undefined;
  if (context.working) media = (await readPendingMedia(dir, reel))?.media;
  else {
    const { versionDir } = await requireVersionDir(dir, reel, context.version);
    const text = await readFile(join(versionDir, 'plan.json'), 'utf8').catch(() => readFile(join(versionDir, 'media.json'), 'utf8'));
    media = (JSON.parse(text) as { media?: MediaPlan }).media;
  }
  const placement = media?.placements.find((p) => p.id === id);
  if (!placement) throw new KinottaError('not-found', `Placement ${id} is unavailable.`);
  if (placement.role === 'gap' || placement.role === 'audio') throw new KinottaError('invalid', 'A graded preview needs a picture placement.');
  const source = media!.sources.find((s) => s.id === placement.source);
  if (!source || source.kind === 'audio') throw new KinottaError('invalid', 'A graded preview needs a picture source.');
  return { placement, source, saved: { reel, ...context } };
}

export async function gradedStill(dir: string, reel: string, id: string, time: number, width: number, context: PreviewVersion, draft?: unknown): Promise<string> {
  if (!Number.isFinite(time) || time < 0) throw new KinottaError('invalid', 'Choose a valid placement-local time.');
  if (!Number.isInteger(width) || width < 32 || width > 1280) throw new KinottaError('invalid', 'Choose a still width from 32 to 1280 pixels.');
  if (draft !== undefined) validateGrade(draft);
  const { placement, source, saved } = await placementSource(dir, reel, id, context);
  const duration = placement.duration ?? placement.out - placement.in;
  if (time >= duration) throw new KinottaError('invalid', 'The still time is outside the placement.');
  const file = await mediaFile(dir, source.id, saved, true);
  if (!file) throw new KinottaError('not-found', 'This picture source is unavailable.');
  const filters = gradeFilters(draft === undefined ? placement.grade : draft as Grade);
  return cachedMediaStill(dir, file, placement.in + time, width, [`scale=${DELIVERY_WIDTH}:-2`, filters, exportConversion].filter(Boolean).join(','), source.kind === 'image');
}

export async function gradedPlayback(dir: string, reel: string, id: string, context: PreviewVersion): Promise<GradedPlayback> {
  const { placement, source, saved } = await placementSource(dir, reel, id, context);
  const filters = gradeFilters(placement.grade);
  if (source.kind === 'image') throw new KinottaError('frozen', 'An image has no graded playback copy.');
  if (!filters) throw new KinottaError('frozen', 'This placement is ungraded; play its normal proxy.');
  const file = await mediaFile(dir, source.id, saved);
  if (!file) throw new KinottaError('not-found', 'This video is unavailable.');
  const hash = await hashOf(file);
  const key = digest(JSON.stringify([hash, placement.in, placement.out, digest(filters)]));
  const folder = join(dir, 'reels', '.kinotta', 'graded');
  const target = join(folder, `${key}.mp4`);
  if (await exists(target)) return { file: target, offset: placement.in };
  if (failures.has(target)) {
    const error = failures.get(target);
    failures.delete(target);
    throw error;
  }
  if (!building.has(target)) {
    const job = inCopySlot(async () => {
      if (await exists(target)) return;
      await mkdir(folder, { recursive: true });
      const temporary = join(folder, `${randomUUID()}.mp4`);
      try {
        await makeGradedPlayback(file, temporary, placement.in, placement.out, filters);
        await rename(temporary, target);
      } finally { await rm(temporary, { force: true }); }
    }).catch((error: unknown) => { failures.set(target, error); }).finally(() => { building.delete(target); });
    building.set(target, job);
  }
  return { status: 'rendering' };
}
