import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { ProjectEvent, TranscriptionProgress, Transcriber, TranscriptWord } from '../../server/core/index.ts';
import { parseProgress } from '../../server/core/_internal/runner.ts';
import { autoSections, estimateRemaining } from '../../server/core/_internal/transcription.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 120_000;
const VIDEO = 'media/talk.mp4';
const VIDEO_SECONDS = 12;
const LONG_VIDEO = 'media/long.mp4';
const LONG_SECONDS = 400;

const WORDS: TranscriptWord[] = [
  { text: 'hello', start: 0.5, end: 0.9 },
  { text: 'there', start: 1, end: 1.4 },
  { text: 'friends.', start: 1.5, end: 2 },
];

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));

/** A transcriber that reports 3 s and 6 s, then waits for `release()` before giving its words. */
function gatedTranscriber(words: TranscriptWord[] = WORDS): { transcriber: Transcriber; release(): void; reported: Promise<void> } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let reported!: () => void;
  const reportedOnce = new Promise<void>((resolve) => (reported = resolve));
  const transcriber: Transcriber = async (_video, onProgress) => {
    onProgress?.(3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    onProgress?.(6);
    reported();
    await gate;
    return words;
  };
  return { transcriber, release, reported: reportedOnce };
}

describe('progress while transcribing', () => {
  it('reports seconds done and an estimate through transcriptionProgress and events, then done', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const { transcriber, release, reported } = gatedTranscriber();
    const project = openProject(dir, { transcriber });
    const events: TranscriptionProgress[] = [];
    const stop = project.subscribe((event: ProjectEvent) => {
      if (event.type === 'transcription-progress') events.push(event.progress);
    });

    const { slug } = await project.startReel({ video: VIDEO, title: 'Watched' });
    await reported;

    // startReel has returned and the reel plays: footage and plan are there, no version yet.
    const reelDir = join(dir, 'reels', slug);
    expect(existsSync(join(reelDir, 'plan.json'))).toBe(true);
    expect(existsSync(join(reelDir, 'v1'))).toBe(false);
    const running = project.transcriptionProgress(slug)!;
    expect(running).toMatchObject({ state: 'running', processed: 6 });
    expect(running.duration).toBeCloseTo(VIDEO_SECONDS, 0);
    expect(running.remaining).not.toBeNull();
    expect(running.remaining).toBeGreaterThanOrEqual(0);
    expect(events.map((e) => e.processed)).toEqual([0, 3, 6]);
    expect(events[0]!.remaining).toBeNull();

    release();
    await project.whenTranscribed(slug);
    stop();

    expect(project.transcriptionProgress(slug)).toMatchObject({ state: 'done', remaining: 0 });
    expect(events[events.length - 1]!.state).toBe('done');
    expect(readJson(join(reelDir, 'transcript.json')).words).toEqual(WORDS);
    const version = await project.readVersion(slug, 1);
    expect(version.overlays.map((o) => o.kind)).toEqual(['CAPTIONS']);
    expect(version.transcript).toEqual(WORDS);
    expect(readJson(join(reelDir, 'v1', 'shots.json')).builtBy).toBe('you');
  });

  it('knows nothing about a reel it did not start', () => {
    expect(openProject(copyFixture('footage-project')).transcriptionProgress('founder-talk')).toBeNull();
  });

  it('works the estimate out from the audio length, the seconds done and the time taken', () => {
    expect(estimateRemaining(100, 0, 5000)).toBeNull();
    expect(estimateRemaining(100, 25, 10_000)).toBe(30);
    expect(estimateRemaining(100, 100, 40_000)).toBe(0);
  });

  it('reads the script\'s progress lines and ignores its other output', () => {
    expect(parseProgress('{"progress": 12.5, "duration": 60}')).toBe(12.5);
    expect(parseProgress('7 words -> out.json')).toBeNull();
    expect(parseProgress('{"other": 1}')).toBeNull();
  });
});

describe('edits made while transcribing', () => {
  it('collect with no version, refuse Save, and still apply once v1 arrives', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const { transcriber, release, reported } = gatedTranscriber();
    const project = openProject(dir, { transcriber });
    const { slug } = await project.startReel({ video: VIDEO, title: 'Snipped early' });
    await reported;

    const early = await project.addOperation(slug, { kind: 'snip', from: 4, to: 6 });

    expect(early).toMatchObject({ base: 0, operations: [{ kind: 'snip', from: 4, to: 6 }] });
    await expect(project.saveEdits(slug)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('no version yet') });

    release();
    await project.whenTranscribed(slug);
    const after = await project.readEditList(slug);

    expect(after).toMatchObject({ base: 1, operations: [{ kind: 'snip', from: 4, to: 6 }] });
    expect(after.flagged).toBeUndefined();
    expect(after.stale).toBeUndefined();
    // v1 was built from the unedited plan; Save puts the early snip into v2.
    expect((await project.readVersion(slug, 1)).duration).toBeCloseTo(VIDEO_SECONDS, 0);
    expect(await project.saveEdits(slug)).toEqual({ version: 2 });
    expect((await project.readVersion(slug, 2)).duration).toBeCloseTo(VIDEO_SECONDS - 2, 0);
  });

  it('are kept when transcription fails, and the reel stays without a version', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir, {
      transcriber: async (_video, onProgress) => {
        onProgress?.(2);
        throw new Error('ffmpeg is not installed');
      },
    });
    const { slug } = await project.startReel({ video: VIDEO, title: 'Failing' });
    await project.whenTranscribed(slug);

    await project.addOperation(slug, { kind: 'snip', from: 1, to: 2 });

    expect(project.transcriptionProgress(slug)).toMatchObject({ state: 'failed', processed: 2, error: expect.stringContaining('ffmpeg') });
    expect((await project.readEditList(slug)).operations).toHaveLength(1);
    expect(existsSync(join(dir, 'reels', slug, 'v1'))).toBe(false);
  });
});

/** One half-second word per second up to `until` seconds, with the given extra silences (seconds) before the words at those indexes. */
function spoken(until: number, silences: Record<number, number> = {}): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let clock = 0;
  for (let i = 0; clock < until; i++) {
    clock += silences[i] ?? 0;
    words.push({ text: `w${i}`, start: clock, end: clock + 0.5 });
    clock += 1;
  }
  return words;
}

/** The middle of the silence before word `i`. */
const middleBefore = (words: TranscriptWord[], i: number): number => (words[i - 1]!.end + words[i]!.start) / 2;

describe('automatic sections', () => {
  it('gives a video under about three minutes one section', () => {
    expect(autoSections(WORDS, 120, 'Short')).toEqual([{ id: 'all', name: 'Short', start: 0, end: 120 }]);
    // Just over three minutes is still one: a second section would be a few seconds long.
    expect(autoSections(spoken(190), 190, 'Barely')).toHaveLength(1);
  });

  it('splits a longer video every three minutes at the largest pause near each boundary', () => {
    // Around 180 s: a 1 s silence at word 140, a 3 s one at word 178, and a 9 s one at word 100 (too far from any boundary).
    const words = spoken(600, { 100: 9, 140: 1, 178: 3, 340: 8 });
    const firstAt = middleBefore(words, 178);
    const secondAt = middleBefore(words, 340);

    const sections = autoSections(words, 600, 'Long');

    expect(sections.map((s) => s.id)).toEqual(['part-1', 'part-2', 'part-3', 'part-4']);
    expect(sections[0]!.start).toBe(0);
    expect(sections[0]!.end).toBeCloseTo(firstAt, 2);
    expect(sections[1]!.end).toBeCloseTo(secondAt, 2);
    expect(sections[3]!.end).toBe(600);
    // Each section starts where the one before ends.
    expect(sections.slice(1).map((s) => s.start)).toEqual(sections.slice(0, -1).map((s) => s.end));
  });

  it('falls back to the three-minute mark where the speech has no pause', () => {
    const sections = autoSections([], 400, 'Silent');

    expect(sections.map((s) => [s.start, s.end])).toEqual([
      [0, 180],
      [180, 360],
      [360, 400],
    ]);
  });
});

/** A 400 s video made for the test: small, silent, black. */
function makeLongVideo(file: string): void {
  const args = ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=2', '-t', String(LONG_SECONDS), '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', file];
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg could not make the long video: ${run.stderr}`);
}

describe('a long video', () => {
  it('becomes a reel with a section per three minutes in its plan and its v1', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    makeLongVideo(join(dir, LONG_VIDEO));
    const words = spoken(LONG_SECONDS - 10, { 181: 4, 362: 4 });
    const project = openProject(dir, { transcriber: async () => words });

    const { slug } = await project.startReel({ video: LONG_VIDEO, title: 'Long one' });
    await project.whenTranscribed(slug);

    expect(project.transcriptionProgress(slug)).toMatchObject({ state: 'done' });
    const plan = readJson(join(dir, 'reels', slug, 'plan.json'));
    expect(plan.sections.map((s: any) => s.id)).toEqual(['part-1', 'part-2', 'part-3']);
    expect(plan.sections[0].end).toBeGreaterThan(150);
    expect(plan.sections[0].end).toBeLessThan(210);
    expect(plan.sections[2].end).toBeCloseTo(LONG_SECONDS, 0);
    const version = await project.readVersion(slug, 1);
    expect(version.sections.map((s) => s.name)).toEqual(['Part 1', 'Part 2', 'Part 3']);
    expect(version.sections[1]!.start).toBeCloseTo(plan.sections[1].start, 0);
    expect(version.issues).toEqual([]);
  });
});

const SPOKEN_VIDEO = 'media/spoken.mp4';
const SPEECH = 'Hello there. This is a short test of the transcription of a video.';

/** The 12-second sample has no audio track, so the real run gets it with a voice (ffmpeg's flite) added; the picture is the sample's own. */
function addSpeech(dir: string): void {
  const args = ['-loglevel', 'error', '-y', '-i', join(dir, VIDEO), '-f', 'lavfi', '-i', `flite=text='${SPEECH}'`, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-t', String(VIDEO_SECONDS), join(dir, SPOKEN_VIDEO)];
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg could not add a voice to the sample (it needs libflite): ${run.stderr}`);
}

/** Opt in with KINOTTA_REAL_WHISPER=1: runs the real faster-whisper (Python, ffmpeg and the model) on the 12-second sample. */
describe.skipIf(process.env.KINOTTA_REAL_WHISPER !== '1')('real faster-whisper', () => {
  it('transcribes the sample video with progress and builds v1', { timeout: 15 * 60_000 }, async () => {
    const dir = copyFixture('footage-project');
    addSpeech(dir);
    const project = openProject(dir);
    const seen: number[] = [];
    project.subscribe((event) => {
      if (event.type === 'transcription-progress') seen.push(event.progress.processed);
    });

    const { slug } = await project.startReel({ video: SPOKEN_VIDEO, title: 'Real words' });
    await project.whenTranscribed(slug);

    expect(project.transcriptionProgress(slug)).toMatchObject({ state: 'done' });
    expect(seen.length).toBeGreaterThan(2);
    expect(Math.max(...seen)).toBeGreaterThan(0);
    const { words } = readJson(join(dir, 'reels', slug, 'transcript.json')) as { words: TranscriptWord[] };
    expect(words.map((w) => w.text.toLowerCase()).join(' ')).toContain('hello');
    for (const word of words) expect(word.end).toBeGreaterThanOrEqual(word.start);
    const version = await project.readVersion(slug, 1);
    expect(version.transcript!.length).toBe(words.length);
    expect(version.issues).toEqual([]);
  });
});
