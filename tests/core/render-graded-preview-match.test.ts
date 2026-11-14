import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { contentProxyPath, ensureEditingProxy, hashOf } from '../../server/core/_internal/import.ts';
import { mediaRenderArgs } from '../../server/core/_internal/media-render.ts';
import type { Grade } from '../../server/core/_internal/grade.ts';
import { copyFixture } from '../helpers/project.ts';

const reel = 'founder-talk';
const STRONG: Grade = { exposure: 1.2, temperature: 4000, saturation: 1.3, highlightsColor: [0.169, 0.038, -0.207] };
const MAX_MEAN_PIXEL_DIFFERENCE = 0.5;

function ffmpeg(args: string[]): Buffer {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024 });
  expect(result.status, result.stderr.toString()).toBe(0);
  return result.stdout;
}

function framePixels(file: string, seek: string[] = []): Buffer {
  return ffmpeg([...seek, '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
}

function meanPixelDifference(a: string, b: string): number {
  const left = framePixels(a);
  const right = framePixels(b);
  expect(left.length).toBe(right.length);
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]!), 0) / left.length;
}

const DELIVERY_WIDTH = 1920;
const DELIVERY_HEIGHT = 1080;
const STILL_WIDTH = 320;

async function stillExportDifference(grade: Grade | undefined, source: string) {
  const dir = copyFixture('footage-project');
  const file = join(dir, 'bright.mp4');
  ffmpeg(['-f', 'lavfi', '-i', source, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const hash = await hashOf(file);
  await ensureEditingProxy(dir, file, hash);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x304060:s=320x180:r=24:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', contentProxyPath(dir, hash)]);
  const media = (prefix: string) => ({
    schema: 1 as const,
    sources: [{ id: 'video', kind: 'video' as const, path: `${prefix}bright.mp4`, duration: 4, contentHash: hash, audio: false }],
    placements: [{ id: 'take', role: 'main' as const, source: 'video', in: 0, out: 4, ...(grade ? { grade } : {}) }],
    sequence: ['take'],
  });
  writeFileSync(join(dir, 'reels', reel, 'v1', 'plan.json'), JSON.stringify({ title: 'Match', duration: 4, clips: [], media: media('../../../') }));
  writeFileSync(join(dir, 'reels', reel, 'plan.json'), JSON.stringify({ title: 'Match', duration: 4, clips: [], media: media('../../') }));
  const overlay = join(dir, 'overlay.png');
  ffmpeg(['-f', 'lavfi', '-i', `color=c=black@0:s=${DELIVERY_WIDTH}x${DELIVERY_HEIGHT},format=rgba`, '-frames:v', '1', overlay]);

  const still = await openProject(dir).gradedStill(reel, 'take', 3, STILL_WIDTH, { version: 1 });
  const exported = join(dir, 'export.mp4');
  ffmpeg(mediaRenderArgs(media('../../../'), join(dir, 'reels', reel, 'v1'), overlay, exported, 4, DELIVERY_WIDTH, DELIVERY_HEIGHT, '24', 12).args);
  const exportedStill = join(dir, 'export-still.jpg');
  ffmpeg(['-ss', '3', '-i', exported, '-frames:v', '1', '-vf', `scale=${STILL_WIDTH}:-2`, '-q:v', '4', exportedStill]);
  return meanPixelDifference(still, exportedStill);
}

it('matches the exported frame to within half a level per pixel on a bright clip', { timeout: 90_000 }, async () => {
  expect(await stillExportDifference(STRONG, 'gradients=s=1920x1080:r=24:d=4:c0=0x906a50:c1=0x887058:x0=0:y0=0:x1=1920:y1=1080:seed=7:speed=0')).toBeLessThan(MAX_MEAN_PIXEL_DIFFERENCE);
});

it('grades a larger detailed source at delivery size like the export', { timeout: 90_000 }, async () => {
  expect(await stillExportDifference(STRONG, 'testsrc2=size=1920x1080:rate=24:duration=4')).toBeLessThan(MAX_MEAN_PIXEL_DIFFERENCE);
});

it('converts a neutral grade the way the export does', { timeout: 90_000 }, async () => {
  expect(await stillExportDifference(undefined, 'gradients=s=1920x1080:r=24:d=4:c0=0x906a50:c1=0x887058:x0=0:y0=0:x1=1920:y1=1080:seed=7:speed=0')).toBeLessThan(MAX_MEAN_PIXEL_DIFFERENCE);
});
