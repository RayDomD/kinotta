import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { beforeAll, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Project, RenderJob, RenderRequest, Transcriber } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 300_000;
const VIDEO = 'media/talk.mp4';
const VIDEO_SECONDS = 12;
const FPS = 10;
const SAMPLE_RATE = 48000;
/** A tone whose phase at a cut is far from zero: 437 Hz is not a whole number of cycles at 5.3 s. */
const TONE = `0.8*sin(2*PI*437*t)`;
const SNIP = { from: 3, to: 5.3 };
const TIMELINE_SECONDS = VIDEO_SECONDS - (SNIP.to - SNIP.from);
/** A timeline time after the snip, while the caption "later" shows: source 8.3. */
const CHECK_AT = 6;
/** Mean difference per channel (0 to 255) allowed between a rendered frame and the page over the footage. */
const FRAME_TOLERANCE = 4;
/** Samples either side of the cut that are looked at. */
const CUT_WINDOW = 10;
/** A Draft is half the footage's 360 lines. */
const DRAFT_HEIGHT = 180;

const WORDS = [
  { text: 'hello', start: 0.5, end: 0.9 },
  { text: 'there', start: 1, end: 1.4 },
  { text: 'friends.', start: 1.5, end: 2 },
  { text: 'later', start: 8.2, end: 8.6 },
];
const fakeTranscriber: Transcriber = async () => WORDS;

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));

function ffmpeg(args: string[]): Buffer {
  const run = spawnSync('ffmpeg', ['-loglevel', 'error', ...args], { maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.toString()}`);
  return run.stdout;
}

function probe(file: string): { streams: Array<Record<string, string | number>>; duration: number } {
  const run = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const parsed = JSON.parse(run.stdout) as { streams: Array<Record<string, string | number>>; format: { duration: string } };
  return { streams: parsed.streams, duration: Number(parsed.format.duration) };
}

/** One video frame, by its index, as raw RGB. */
const frameAt = (file: string, index: number): Buffer => ffmpeg(['-i', file, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);

const meanDifference = (a: Buffer, b: Buffer): number => {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
};

/** The audio as mono float samples. */
function samples(file: string): Float32Array {
  const raw = ffmpeg(['-i', file, '-map', '0:a', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-']);
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

const loudestNear = (audio: Float32Array, at: number): number => {
  let peak = 0;
  for (let i = at - CUT_WINDOW; i <= at + CUT_WINDOW; i++) peak = Math.max(peak, Math.abs(audio[i]!));
  return peak;
};

interface Reel {
  dir: string;
  reelDir: string;
  slug: string;
  project: Project;
}

/** The footage sample with a tone for sound, started as a reel with one clip, then snipped, saved as v2 and approved. */
async function snippedReel(): Promise<Reel> {
  const dir = copyFixture('footage-project');
  const source = ['-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=${FPS}:duration=${VIDEO_SECONDS}`, '-f', 'lavfi', '-i', `aevalsrc=${TONE}:s=${SAMPLE_RATE}:d=${VIDEO_SECONDS}`];
  ffmpeg(['-y', ...source, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', String(FPS), '-c:a', 'aac', '-b:a', '256k', '-shortest', join(dir, VIDEO)]);
  const project = openProject(dir, { transcriber: fakeTranscriber });
  const { slug } = await project.startReel({ video: VIDEO, title: 'Snippy' });
  await project.whenTranscribed(slug);
  const reelDir = join(dir, 'reels', slug);
  mkdirSync(join(reelDir, 'clips'));
  cpSync(join(dir, 'motion/clips/01-two-laptops.html'), join(reelDir, 'clips/01-two-laptops.html'));
  const plan = readJson(join(reelDir, 'plan.json'));
  plan.clips = [{ id: '01', title: 'Two laptops', in: 0, out: 2.8, kind: 'full', section: 'all', still: 0, description: 'Two laptops.' }];
  writeFileSync(join(reelDir, 'plan.json'), JSON.stringify(plan));
  await project.addOperation(slug, { kind: 'snip', ...SNIP });
  await project.saveEdits(slug);
  // Final and Overlay pass the render gate only for an approved version.
  const { warning } = await project.approveVersion(slug, 2);
  expect(warning).toBeUndefined();
  return { dir, reelDir, slug, project };
}

async function rendered(reel: Reel, request: Omit<RenderRequest, 'reel'>): Promise<RenderJob> {
  const job = await reel.project.whenRendered((await reel.project.render({ reel: reel.slug, ...request })).id);
  expect(job.error).toBeUndefined();
  return job;
}

/** What the version page draws at a timeline time, laid over the footage frame at a source time, `height` tall, as raw RGB. */
async function pageOverFootage(reel: Reel, version: number, timelineAt: number, sourceFrame: number, height = 360): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: height / 1080 });
    await page.goto(`${pathToFileURL(join(reel.reelDir, `v${version}`, 'index.html')).href}?render`);
    await page.evaluate(async (t) => {
      await document.fonts.ready;
      (window as unknown as { seek(t: number): void }).seek(t);
    }, timelineAt);
    const overlay = join(reel.dir, 'overlay.png');
    writeFileSync(overlay, await page.screenshot({ omitBackground: true }));
    const footage = join(reel.dir, 'footage-frame.png');
    ffmpeg(['-y', '-i', join(reel.dir, VIDEO), '-vf', `select=eq(n\\,${sourceFrame})`, '-frames:v', '1', footage]);
    return ffmpeg(['-i', footage, '-i', overlay, '-filter_complex', `[0:v]scale=-2:${height}[f];[f][1:v]overlay=format=auto`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  } finally {
    await browser.close();
  }
}

describe('Final and Overlay of a footage reel', () => {
  let reel: Reel;
  beforeAll(async () => {
    reel = await snippedReel();
  }, SLOW_MS);

  it("renders a Final as long as the version's pieces, at the footage's size and rate, with sound and no intermediate file", { timeout: SLOW_MS }, async () => {
    const renders = join(reel.reelDir, 'renders');
    const seen = new Set<string>();
    const watch = setInterval(() => existsSync(renders) && readdirSync(renders).forEach((name) => seen.add(name)), 50);
    const job = await rendered(reel, { version: 2, preset: 'final' }).finally(() => clearInterval(watch));

    expect(job.output).toBe(`reels/${reel.slug}/renders/${reel.slug}-v2-final-360p10.mp4`);
    const { streams, duration } = probe(join(reel.dir, job.output!));
    expect(duration).toBeCloseTo(TIMELINE_SECONDS, 1);
    expect(streams.find((s) => s.codec_type === 'video')).toMatchObject({ codec_name: 'h264', width: 640, height: 360, r_frame_rate: '10/1' });
    expect(streams.some((s) => s.codec_type === 'audio')).toBe(true);
    // Only the temp name and the finished file ever appear: no ProRes or other intermediate.
    for (const name of seen) expect(name).toMatch(new RegExp(`^(\\.render-[\\w-]+\\.mp4|${reel.slug}-v2-final-360p10\\.mp4)$`));
  });

  it('draws the frame at a time after the snip as the page over the footage at the mapped source time', { timeout: SLOW_MS }, async () => {
    const file = join(reel.dir, (await rendered(reel, { version: 2, preset: 'final' })).output!);
    const frame = frameAt(file, CHECK_AT * FPS);
    const sourceAt = CHECK_AT + (SNIP.to - SNIP.from);

    const mapped = await pageOverFootage(reel, 2, CHECK_AT, Math.round(sourceAt * FPS));
    const unmapped = await pageOverFootage(reel, 2, CHECK_AT, CHECK_AT * FPS);

    expect(meanDifference(frame, mapped)).toBeLessThan(FRAME_TOLERANCE);
    expect(meanDifference(frame, unmapped)).toBeGreaterThan(FRAME_TOLERANCE);
  });

  it('draws a frame inside the clip as the page at that time, with no frames lost before it', { timeout: SLOW_MS }, async () => {
    // A Draft has no motion blur, so a moving clip matches the page seeked to the same instant.
    const file = join(reel.dir, (await rendered(reel, { version: 2, preset: 'draft' })).output!);
    const inClip = 1.5;

    const expected = await pageOverFootage(reel, 2, inClip, inClip * FPS, DRAFT_HEIGHT);
    const later = await pageOverFootage(reel, 2, inClip + 1, inClip * FPS, DRAFT_HEIGHT);

    const frame = frameAt(file, inClip * FPS);
    expect(meanDifference(frame, expected)).toBeLessThan(FRAME_TOLERANCE);
    expect(meanDifference(frame, later)).toBeGreaterThan(FRAME_TOLERANCE);
  });

  it('fades the sound to silence at a cut with Smooth, and cuts it directly with Hard', { timeout: SLOW_MS }, async () => {
    const smooth = samples(join(reel.dir, (await rendered(reel, { version: 2, preset: 'final' })).output!));
    const hardJob = await rendered(reel, { version: 2, preset: 'draft', audio: 'hard' });
    const hard = samples(join(reel.dir, hardJob.output!));
    const cut = SNIP.from * SAMPLE_RATE;

    expect(hardJob.output).toBe(`reels/${reel.slug}/renders/${reel.slug}-v2-draft-180p10-hardcuts.mp4`);
    expect(loudestNear(smooth, cut)).toBeLessThan(0.05);
    // Straight into the tone where the second piece starts, well above the fade.
    expect(loudestNear(hard, cut)).toBeGreaterThan(0.3);
  });

  it("scales a Draft to 1080p at the footage's aspect ratio, at the frame rate asked for", { timeout: SLOW_MS }, async () => {
    const job = await rendered(reel, { version: 2, preset: 'draft', size: '1080p', fps: 25 });

    expect(job.output).toBe(`reels/${reel.slug}/renders/${reel.slug}-v2-draft-1080p25.mp4`);
    const { streams, duration } = probe(join(reel.dir, job.output!));
    expect(streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080, r_frame_rate: '25/1' });
    expect(duration).toBeCloseTo(TIMELINE_SECONDS, 1);
  });

  it('writes an Overlay as ProRes 4444 with alpha and no sound', { timeout: SLOW_MS }, async () => {
    const job = await rendered(reel, { version: 2, preset: 'overlay' });

    expect(job.output).toBe(`reels/${reel.slug}/renders/${reel.slug}-v2-overlay-360p10.mov`);
    const { streams, duration } = probe(join(reel.dir, job.output!));
    expect(streams).toHaveLength(1);
    // ffprobe names the decoded format: any yuva444 is 4:4:4 with alpha.
    expect(streams[0]).toMatchObject({ codec_type: 'video', codec_name: 'prores', profile: '4444', pix_fmt: expect.stringMatching(/^yuva444/), width: 640, height: 360 });
    expect(duration).toBeCloseTo(TIMELINE_SECONDS, 1);
  });

  it('renders an earlier version the same after a later edit and Save', { timeout: SLOW_MS }, async () => {
    const draft = async (): Promise<string> => join(reel.dir, (await rendered(reel, { version: 2, preset: 'draft' })).output!);
    const before = join(reel.dir, 'v2-before.mp4');
    cpSync(await draft(), before);

    await reel.project.addOperation(reel.slug, { kind: 'snip', from: 1, to: 2 });
    await reel.project.saveEdits(reel.slug);
    expect((await reel.project.listVersions(reel.slug)).map((v) => v.number)).toEqual([1, 2, 3]);
    const after = await draft();

    // A clip's frames can differ by a hair from one render to the next, so frames are compared within the tolerance;
    // v3's snip would shift every frame after it and shorten the file.
    expect(probe(after).duration).toBe(probe(before).duration);
    for (const second of [0.5, 2.5, 4.5, 6.5, 8.5]) {
      expect(meanDifference(frameAt(after, second * FPS), frameAt(before, second * FPS))).toBeLessThan(FRAME_TOLERANCE);
    }
  });

  it('renders a Final in segments to the same frames and sound as one page', { timeout: SLOW_MS }, async () => {
    const segmented = async (segments: number): Promise<string> => {
      const project = openProject(reel.dir, { transcriber: fakeTranscriber, renderSegments: segments });
      const job = await project.whenRendered((await project.render({ reel: reel.slug, version: 2, preset: 'final' })).id);
      expect(job.error).toBeUndefined();
      const kept = join(reel.dir, `segments-${segments}.mp4`);
      cpSync(join(reel.dir, job.output!), kept);
      return kept;
    };
    const one = await segmented(1);
    const three = await segmented(3);

    const frames = Math.round(TIMELINE_SECONDS * FPS);
    expect(probe(three).duration).toBeCloseTo(probe(one).duration, 1);
    // The first and last frames, both sides of each segment boundary, and a frame inside the clip.
    for (const index of [0, 15, Math.round(frames / 3) - 1, Math.round(frames / 3), Math.round((2 * frames) / 3) - 1, Math.round((2 * frames) / 3), frames - 1]) {
      expect(meanDifference(frameAt(three, index), frameAt(one, index))).toBeLessThan(FRAME_TOLERANCE);
    }
    const cut = SNIP.from * SAMPLE_RATE;
    expect(loudestNear(samples(three), cut)).toBeLessThan(0.05);
  });

  it('cancels a Final mid-render, stopping the renderer and ffmpeg and leaving no temp file', { timeout: SLOW_MS }, async () => {
    const renders = join(reel.reelDir, 'renders');
    const listing = (): string[] => (existsSync(renders) ? readdirSync(renders).sort() : []);
    const before = listing();
    const started = new Promise<string>((resolveId) => {
      const stop = reel.project.subscribe((event) => {
        if (event.type !== 'render-progress' || event.job.state !== 'running' || event.job.progress === 0) return;
        stop();
        resolveId(event.job.id);
      });
    });

    await reel.project.render({ reel: reel.slug, version: 2, preset: 'final' });
    const job = await reel.project.cancelRender(await started);

    expect(job.state).toBe('cancelled');
    expect(listing()).toEqual(before);
  });
});

describe('Final and Overlay of a code-only reel', () => {
  const PAGE = (alpha: boolean): string => `<!DOCTYPE html><html${alpha ? ' class="alpha"' : ''}><head><style>html,body{margin:0;background:${alpha ? 'transparent' : '#211b16'}}
#box{position:absolute;top:40%;width:10vh;height:10vh;background:#e8741c}</style></head>
<body><section data-scene="box" data-start="0" data-duration="0.5"><div id="box" data-el="box"></div></section><script>window.DURATION=0.5;window.seek=function(t){document.getElementById('box').style.left=(t*80)+'vw';};seek(0);</script></body></html>`;

  function codeOnly(alpha: boolean): { dir: string; project: Project } {
    const dir = copyFixture('showreel-project');
    const reelDir = join(dir, 'reels', 'tiny');
    mkdirSync(join(reelDir, 'v1'), { recursive: true });
    writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Tiny' }));
    writeFileSync(join(reelDir, 'v1', 'index.html'), PAGE(alpha));
    writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: 0.5, shots: [{ number: '01', start: 0, title: 'Box', description: 'A box.' }] }));
    // Final and Overlay pass the render gate only for an approved version.
    writeFileSync(join(reelDir, 'v1', 'approval.json'), JSON.stringify({ approvedBy: 'you', at: '2026-10-05T00:00:00.000Z' }));
    return { dir, project: openProject(dir) };
  }

  it('refuses an Overlay of a page that is not transparent', { timeout: SLOW_MS }, async () => {
    const { project } = codeOnly(false);

    await expect(project.render({ reel: 'tiny', version: 1, preset: 'overlay' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringMatching(/transparent/) });
  });

  it('renders an Overlay of a transparent page as ProRes 4444, and a Final at full size and CRF 16', { timeout: SLOW_MS }, async () => {
    const { dir, project } = codeOnly(true);

    const overlay = await project.whenRendered((await project.render({ reel: 'tiny', version: 1, preset: 'overlay' })).id);
    const final = await project.whenRendered((await project.render({ reel: 'tiny', version: 1, preset: 'final' })).id);

    expect(overlay.output).toBe('reels/tiny/renders/tiny-v1-overlay-1080p30.mov');
    expect(probe(join(dir, overlay.output!)).streams[0]).toMatchObject({ codec_name: 'prores', pix_fmt: expect.stringMatching(/^yuva444/), width: 1920, height: 1080 });
    expect(final.output).toBe('reels/tiny/renders/tiny-v1-final-1080p30.mp4');
    expect(readFileSync(join(dir, final.output!)).toString('latin1')).toContain('crf=16.0');
  });
});
