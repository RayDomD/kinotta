import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject, versionIssues } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const SLOW_MS = 300_000;
const VIDEO = 'media/talk.mp4';
const REEL = 'founder-talk';
const VIDEO_SECONDS = 4;
const FPS = 10;
const CHECK_FRAME = 20;
const TRIMMED_OUT = 3;
const FRAME_TOLERANCE = 6;
const PAGE_GROUND_MARGIN = 20;
const NATIVE_PLAN = {
  duration: VIDEO_SECONDS,
  clips: [],
  media: {
    schema: 1,
    sources: [{ id: 'video', kind: 'video', path: `../../${VIDEO}`, duration: VIDEO_SECONDS, audio: false }],
    placements: [{ id: 'main', role: 'main', source: 'video', in: 0, out: VIDEO_SECONDS }],
    sequence: ['main'],
  },
};

function ffmpeg(args: string[]): Buffer {
  const run = spawnSync('ffmpeg', ['-loglevel', 'error', ...args], { maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.toString()}`);
  return run.stdout;
}

const frameAt = (file: string, index: number, height: number): Buffer => ffmpeg(['-i', file, '-vf', `select=eq(n\\,${index}),scale=-2:${height}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);

const meanDifference = (a: Buffer, b: Buffer): number => {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
};

function footageOnlyProject() {
  const dir = copyFixture('footage-project');
  ffmpeg(['-y', '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=${FPS}:duration=${VIDEO_SECONDS}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', String(FPS), join(dir, VIDEO)]);
  writeFileSync(join(dir, 'reels', REEL, 'plan.json'), JSON.stringify(NATIVE_PLAN));
  return { dir, project: openProject(dir, { renderSegments: 1 }) };
}

describe('a footage reel with no b-roll clips', () => {
  it('renders a Final that shows the footage', { timeout: SLOW_MS }, async () => {
    const { dir, project } = footageOnlyProject();
    await project.addOperation(REEL, { kind: 'placement-change', placement: 'main', changes: { out: TRIMMED_OUT } });
    const job = await project.whenRendered((await project.renderWorking({ reel: REEL, preset: 'final' })).id);
    expect(job.error).toBeUndefined();
    const height = 360;
    const rendered = frameAt(join(dir, job.output!), CHECK_FRAME, height);
    const source = frameAt(join(dir, VIDEO), CHECK_FRAME, height);
    expect(meanDifference(rendered, source)).toBeLessThan(FRAME_TOLERANCE);
    expect(meanDifference(rendered, Buffer.alloc(rendered.length, 233))).toBeGreaterThan(PAGE_GROUND_MARGIN);
  });

  it('reports no contract issue for the version a Final freezes', { timeout: SLOW_MS }, async () => {
    const { project } = footageOnlyProject();
    await project.addOperation(REEL, { kind: 'placement-change', placement: 'main', changes: { out: TRIMMED_OUT } });
    await project.whenRendered((await project.renderWorking({ reel: REEL, preset: 'final' })).id);
    const version = await project.readVersion(REEL, 2);
    expect(version.issues).toEqual([]);
    expect((await project.readWorkingVersion(REEL)).issues).toEqual([]);
    await project.setNote(REEL, 2, 'Great cut');
    expect((await project.copyBatch(REEL, 2, { includeIssues: true })).text).not.toContain('Contract issues');
    expect(versionIssues(version)).toEqual([]);
  });
});

describe('a legacy footage reel with no b-roll clips', () => {
  it('renders a Final that shows the legacy footage', { timeout: SLOW_MS }, async () => {
    const { dir, project } = footageOnlyProject();
    const reelDir = join(dir, 'reels', REEL);
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({ duration: VIDEO_SECONDS, video: VIDEO, clips: [], pieces: [{ in: 0, out: VIDEO_SECONDS }] }));
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: VIDEO_SECONDS, shots: [] }));
    writeFileSync(join(reelDir, 'v1', 'index.html'), '<!doctype html><html><body><script>window.DURATION=4;window.seek=function(t){};</script></body></html>');
    const version = await project.readVersion(REEL, 1);
    expect(version.footage).toBeDefined();
    const job = await project.whenRendered((await project.render({ reel: REEL, version: 1, preset: 'final' })).id);
    expect(job.error).toBeUndefined();
    expect(version.issues).toEqual([]);
    const height = 360;
    const rendered = frameAt(join(dir, job.output!), CHECK_FRAME, height);
    expect(meanDifference(rendered, frameAt(join(dir, VIDEO), CHECK_FRAME, height))).toBeLessThan(FRAME_TOLERANCE);
    expect(meanDifference(rendered, Buffer.alloc(rendered.length, 233))).toBeGreaterThan(PAGE_GROUND_MARGIN);
  });
});

describe('a footage reel with b-roll clips and a page with no scenes', () => {
  const BROLL_CLIPS = [{ id: 'broll-1', in: 1, out: 3 }];
  const BROLL_SHOTS = { contract: 1, duration: VIDEO_SECONDS, shots: [{ number: '1', title: 'broll-1', start: 1, duration: 2, type: 'cutaway', line: { start: 1, end: 3 } }] };
  const SCENELESS_PAGE = '<!doctype html><html><body><script>window.DURATION=4;window.seek=function(t){};</script></body></html>';

  it('keeps the no-scenes issue and refuses a Final for a legacy reel', { timeout: SLOW_MS }, async () => {
    const { dir, project } = footageOnlyProject();
    const reelDir = join(dir, 'reels', REEL);
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({ duration: VIDEO_SECONDS, video: VIDEO, clips: BROLL_CLIPS, pieces: [{ in: 0, out: VIDEO_SECONDS }] }));
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(BROLL_SHOTS));
    writeFileSync(join(reelDir, 'v1', 'index.html'), SCENELESS_PAGE);
    expect(versionIssues(await project.readVersion(REEL, 1)).map((issue) => issue.code)).toContain('no-scenes');
    await expect(project.render({ reel: REEL, version: 1, preset: 'final' })).rejects.toThrow(/no scenes/);
  });

  it('keeps the no-scenes issue and refuses a Final for a native media reel', { timeout: SLOW_MS }, async () => {
    const { dir, project } = footageOnlyProject();
    const reelDir = join(dir, 'reels', REEL);
    const plan = { ...NATIVE_PLAN, clips: BROLL_CLIPS };
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify(plan));
    const sources = [{ ...NATIVE_PLAN.media.sources[0]!, path: `../../../${VIDEO}` }];
    writeFileSync(join(reelDir, 'v1', 'plan.json'), JSON.stringify({ ...plan, media: { ...NATIVE_PLAN.media, sources } }));
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify(BROLL_SHOTS));
    writeFileSync(join(reelDir, 'v1', 'index.html'), SCENELESS_PAGE);
    expect(versionIssues(await project.readVersion(REEL, 1)).map((issue) => issue.code)).toContain('no-scenes');
    await expect(project.render({ reel: REEL, version: 1, preset: 'final' })).rejects.toThrow(/no scenes/);
  });
});

describe('a code-only reel with no scenes', () => {
  it('keeps the no-scenes issue and refuses a Final', { timeout: SLOW_MS }, async () => {
    const dir = emptyProject();
    const reelDir = join(dir, 'reels', 'bare');
    mkdirSync(join(reelDir, 'v1'), { recursive: true });
    writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Bare' }));
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: 1, shots: [] }));
    writeFileSync(join(reelDir, 'v1', 'index.html'), '<!doctype html><html><body><script>window.DURATION=1;window.seek=function(t){};</script></body></html>');
    const project = openProject(dir, { renderSegments: 1 });
    expect(versionIssues(await project.readVersion('bare', 1)).map((issue) => issue.code)).toContain('no-scenes');
    await expect(project.render({ reel: 'bare', version: 1, preset: 'final' })).rejects.toThrow(/no scenes/);
  });
});
