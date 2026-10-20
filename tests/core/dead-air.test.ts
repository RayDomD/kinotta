import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cutDeadAir,
  openProject,
  GENTLE_GAP_SECONDS,
  NORMAL_GAP_SECONDS,
  TIGHT_GAP_SECONDS,
  WORD_PAD_SECONDS,
  BREATH_MIN_PEAK,
  BREATH_MAX_PEAK,
  type Piece,
  type TranscriptWord,
} from '../../server/core/index.ts';
import {
  DEAD_AIR_BY,
  NORMAL_BREATH_GAP_SECONDS,
  TIGHT_BREATH_GAP_SECONDS,
  deadAirCuts,
} from '../../server/core/_internal/dead-air.ts';
import { applyOperations, planPieces, snipPieces } from '../../server/core/model.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 120_000;
const copyProjectFixture = copyFixture;

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));

/** Creates a 5s test video where audio has an audible breath-level sine tone in [2.1, 2.4] and silence elsewhere. */
function makeBreathVideo(file: string): void {
  const args = [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=64x64:r=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:duration=5',
    '-af',
    "volume='between(t,2.1,2.4)':eval=frame",
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-t',
    '5',
    file,
  ];
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg could not make breath video: ${run.stderr}`);
}

/** Generates deterministic waveform peak buckets for testing breath audio levels. */
function makePeaks(
  duration: number,
  bucketCount: number,
  defaultLevel: number,
  ranges: { start: number; end: number; level: number }[] = [],
): number[] {
  const peaks = new Array(bucketCount).fill(defaultLevel);
  for (const { start, end, level } of ranges) {
    const fromIdx = Math.floor((start / duration) * bucketCount);
    const toIdx = Math.ceil((end / duration) * bucketCount);
    for (let i = fromIdx; i < toIdx && i < bucketCount; i++) {
      peaks[i] = level;
    }
  }
  return peaks;
}

describe('dead air constants', () => {
  it('exports expected threshold, pad and breath constants', () => {
    expect(GENTLE_GAP_SECONDS).toBe(1.2);
    expect(NORMAL_GAP_SECONDS).toBe(0.7);
    expect(TIGHT_GAP_SECONDS).toBe(0.35);
    expect(WORD_PAD_SECONDS).toBe(0.08);
    expect(NORMAL_BREATH_GAP_SECONDS).toBe(0.4);
    expect(TIGHT_BREATH_GAP_SECONDS).toBe(0.25);
    expect(NORMAL_BREATH_GAP_SECONDS).toBeGreaterThan(TIGHT_BREATH_GAP_SECONDS);
    expect(BREATH_MIN_PEAK).toBe(0.02);
    expect(BREATH_MAX_PEAK).toBe(0.25);
    expect(DEAD_AIR_BY).toBe('dead-air');
  });
});

describe('threshold and pad cutting across strengths', () => {
  // Deterministic 10s clip:
  // - 0.2s gap (1.4..1.6) -> kept by all strengths (0.2 <= 0.35)
  // - 0.5s gap (2.5..3.0) -> cut only by 'tight' (0.5 > 0.35, <= 0.7), pad 0.08 -> cuts 2.58..3.0
  // - 0.9s gap (4.0..4.9) -> cut by 'normal' and 'tight' (0.9 > 0.7, <= 1.2), pad 0.08 -> cuts 4.08..4.9
  // - 1.5s gap (6.0..7.5) -> cut by 'gentle', 'normal', 'tight' (1.5 > 1.2), pad 0.08 -> cuts 6.08..7.5
  // - Leading silence (0..1.0) and trailing silence (8.0..10.0) remain intact.
  const WORDS_10S: TranscriptWord[] = [
    { text: 'one', start: 1.0, end: 1.4 },
    { text: 'two', start: 1.6, end: 2.5 },
    { text: 'three', start: 3.0, end: 4.0 },
    { text: 'four', start: 4.9, end: 6.0 },
    { text: 'five', start: 7.5, end: 8.0 },
  ];
  const DURATION_10S = 10;

  it('cuts only the 1.5s gap for gentle strength', () => {
    const pieces = cutDeadAir(WORDS_10S, DURATION_10S, 'gentle');
    expect(pieces).toEqual([
      { in: 0, out: 6.08 },
      { in: 7.5, out: 10 },
    ]);
  });

  it('cuts 0.9s and 1.5s gaps for normal strength and when strength is omitted', () => {
    const expectedPieces: Piece[] = [
      { in: 0, out: 4.08 },
      { in: 4.9, out: 6.08 },
      { in: 7.5, out: 10 },
    ];
    expect(cutDeadAir(WORDS_10S, DURATION_10S, 'normal')).toEqual(expectedPieces);
    expect(cutDeadAir(WORDS_10S, DURATION_10S)).toEqual(expectedPieces);
  });

  it('cuts 0.5s, 0.9s and 1.5s gaps for tight strength', () => {
    const pieces = cutDeadAir(WORDS_10S, DURATION_10S, 'tight');
    expect(pieces).toEqual([
      { in: 0, out: 2.58 },
      { in: 3.0, out: 4.08 },
      { in: 4.9, out: 6.08 },
      { in: 7.5, out: 10 },
    ]);
  });

  it('preserves leading silence (0..1.0) and trailing silence (8.0..10.0) across all strengths', () => {
    const strengths: ('gentle' | 'normal' | 'tight' | undefined)[] = ['gentle', 'normal', 'tight', undefined];
    for (const strength of strengths) {
      const pieces = strength ? cutDeadAir(WORDS_10S, DURATION_10S, strength) : cutDeadAir(WORDS_10S, DURATION_10S);
      expect(pieces[0]!.in).toBe(0);
      expect(pieces[0]!.out).toBeGreaterThanOrEqual(1.0);
      expect(pieces[pieces.length - 1]!.out).toBe(10);
      expect(pieces[pieces.length - 1]!.in).toBeLessThanOrEqual(8.0);
    }
  });
});

describe('a talk with no long gaps stays one piece', () => {
  const NATURAL_WORDS: TranscriptWord[] = [
    { text: 'hello', start: 1.0, end: 2.5 },
    { text: 'world', start: 2.6, end: 4.0 },
    { text: 'this', start: 4.2, end: 6.0 },
    { text: 'is', start: 6.1, end: 8.0 },
    { text: 'clean', start: 8.2, end: 10.5 },
  ];
  const DURATION_12S = 12;

  it('keeps short natural gaps as a single piece for gentle, normal and tight', () => {
    expect(cutDeadAir(NATURAL_WORDS, DURATION_12S, 'gentle')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir(NATURAL_WORDS, DURATION_12S, 'normal')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir(NATURAL_WORDS, DURATION_12S, 'tight')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir(NATURAL_WORDS, DURATION_12S)).toEqual([{ in: 0, out: 12 }]);
  });

  it('returns a single piece for an empty word list', () => {
    expect(cutDeadAir([], DURATION_12S, 'gentle')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir([], DURATION_12S, 'normal')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir([], DURATION_12S, 'tight')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir([], DURATION_12S)).toEqual([{ in: 0, out: 12 }]);
  });

  it('returns a single piece for a single word', () => {
    const single = [{ text: 'solo', start: 3.0, end: 5.0 }];
    expect(cutDeadAir(single, DURATION_12S, 'gentle')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir(single, DURATION_12S, 'normal')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir(single, DURATION_12S, 'tight')).toEqual([{ in: 0, out: 12 }]);
    expect(cutDeadAir(single, DURATION_12S)).toEqual([{ in: 0, out: 12 }]);
  });
});

describe('audible breath trimming in wordless gaps', () => {
  // Gap of 0.45s from 2.0 to 2.45 (< NORMAL_GAP_SECONDS 0.7, >= NORMAL_BREATH_GAP_SECONDS 0.4).
  // With WORD_PAD_SECONDS 0.08, candidate breath region is [2.08, 2.45].
  const BREATH_WORDS: TranscriptWord[] = [
    { text: 'speaking', start: 1.0, end: 2.0 },
    { text: 'again', start: 2.45, end: 4.0 },
  ];
  // Shorter breath gap of 0.3s from 2.0 to 2.3 (>= TIGHT_BREATH_GAP_SECONDS 0.25, < NORMAL_BREATH_GAP_SECONDS 0.4).
  const SHORT_BREATH_WORDS: TranscriptWord[] = [
    { text: 'speaking', start: 1.0, end: 2.0 },
    { text: 'again', start: 2.3, end: 4.0 },
  ];
  const DURATION_5S = 5;

  it('keeps a breath gap under gentle strength', () => {
    const breathPeaks = makePeaks(DURATION_5S, 500, 0.005, [{ start: 2.08, end: 2.45, level: 0.08 }]);
    const pieces = cutDeadAir(BREATH_WORDS, DURATION_5S, { strength: 'gentle', peaks: breathPeaks });
    expect(pieces).toEqual([{ in: 0, out: 5 }]);
  });

  it('trims a breath gap under normal and tight strengths', () => {
    const breathPeaks = makePeaks(DURATION_5S, 500, 0.005, [{ start: 2.08, end: 2.45, level: 0.08 }]);
    const expected: Piece[] = [
      { in: 0, out: 2.08 },
      { in: 2.45, out: 5 },
    ];
    expect(cutDeadAir(BREATH_WORDS, DURATION_5S, { strength: 'normal', peaks: breathPeaks })).toEqual(expected);
    expect(cutDeadAir(BREATH_WORDS, DURATION_5S, { strength: 'tight', peaks: breathPeaks })).toEqual(expected);
  });

  it('requires a longer minimum breath gap for normal than tight', () => {
    const breathPeaks = makePeaks(DURATION_5S, 500, 0.005, [{ start: 2.08, end: 2.3, level: 0.08 }]);
    expect(cutDeadAir(SHORT_BREATH_WORDS, DURATION_5S, { strength: 'normal', peaks: breathPeaks })).toEqual([
      { in: 0, out: 5 },
    ]);
    expect(cutDeadAir(SHORT_BREATH_WORDS, DURATION_5S, { strength: 'tight', peaks: breathPeaks })).toEqual([
      { in: 0, out: 2.08 },
      { in: 2.3, out: 5 },
    ]);
  });

  // Each strength gets a gap under its own pause threshold, so only the breath rule can cut it.
  const UNDER_PAUSE = { gentle: BREATH_WORDS, normal: BREATH_WORDS, tight: SHORT_BREATH_WORDS } as const;

  it('keeps room tone below the breath band at every strength', () => {
    // 0.015 is loud phone room tone (about -36 dBFS), still below BREATH_MIN_PEAK.
    const roomTonePeaks = makePeaks(DURATION_5S, 500, 0.015);
    for (const strength of ['gentle', 'normal', 'tight'] as const) {
      expect(cutDeadAir(UNDER_PAUSE[strength], DURATION_5S, { strength, peaks: roomTonePeaks })).toEqual([{ in: 0, out: 5 }]);
    }
  });

  it('does not trim when peaks have loud audio above BREATH_MAX_PEAK', () => {
    const loudPeaks = makePeaks(DURATION_5S, 500, 0.005, [{ start: 2.08, end: 2.45, level: 0.6 }]);
    for (const strength of ['gentle', 'normal', 'tight'] as const) {
      expect(cutDeadAir(UNDER_PAUSE[strength], DURATION_5S, { strength, peaks: loudPeaks })).toEqual([{ in: 0, out: 5 }]);
    }
  });
});

describe('deadAirCuts', () => {
  const WORDS_10S: TranscriptWord[] = [
    { text: 'one', start: 1.0, end: 1.4 },
    { text: 'two', start: 1.6, end: 2.5 },
    { text: 'three', start: 3.0, end: 4.0 },
    { text: 'four', start: 4.9, end: 6.0 },
    { text: 'five', start: 7.5, end: 8.0 },
  ];
  const DURATION_10S = 10;
  const NATURAL_WORDS: TranscriptWord[] = [
    { text: 'hello', start: 1.0, end: 2.5 },
    { text: 'world', start: 2.6, end: 4.0 },
    { text: 'this', start: 4.2, end: 6.0 },
    { text: 'is', start: 6.1, end: 8.0 },
    { text: 'clean', start: 8.2, end: 10.5 },
  ];
  const DURATION_12S = 12;
  const BREATH_WORDS: TranscriptWord[] = [
    { text: 'speaking', start: 1.0, end: 2.0 },
    { text: 'again', start: 2.45, end: 4.0 },
  ];
  const DURATION_5S = 5;

  it('returns cuts in ascending source order matching cutDeadAir complement across strengths', () => {
    for (const strength of ['gentle', 'normal', 'tight'] as const) {
      const cuts = deadAirCuts(WORDS_10S, DURATION_10S, strength);
      for (let i = 0; i + 1 < cuts.length; i++) {
        expect(cuts[i]!.from).toBeLessThan(cuts[i]!.to);
        expect(cuts[i]!.to).toBeLessThan(cuts[i + 1]!.from);
      }
      let snipped: Piece[] = [{ in: 0, out: DURATION_10S }];
      for (const cut of cuts) {
        snipped = snipPieces(snipped, cut.from, cut.to);
      }
      expect(snipped).toEqual(cutDeadAir(WORDS_10S, DURATION_10S, strength));
    }
  });

  it('matches cutDeadAir with breath peaks', () => {
    const breathPeaks = makePeaks(DURATION_5S, 500, 0.005, [{ start: 2.08, end: 2.45, level: 0.08 }]);
    for (const strength of ['gentle', 'normal', 'tight'] as const) {
      const cuts = deadAirCuts(BREATH_WORDS, DURATION_5S, { strength, peaks: breathPeaks });
      for (let i = 0; i + 1 < cuts.length; i++) {
        expect(cuts[i]!.from).toBeLessThan(cuts[i]!.to);
        expect(cuts[i]!.to).toBeLessThan(cuts[i + 1]!.from);
      }
      let snipped: Piece[] = [{ in: 0, out: DURATION_5S }];
      for (const cut of cuts) {
        snipped = snipPieces(snipped, cut.from, cut.to);
      }
      expect(snipped).toEqual(cutDeadAir(BREATH_WORDS, DURATION_5S, { strength, peaks: breathPeaks }));
    }
  });

  it('returns empty list when no gaps qualify', () => {
    expect(deadAirCuts(NATURAL_WORDS, DURATION_12S, 'tight')).toEqual([]);
    expect(deadAirCuts([], DURATION_12S, 'tight')).toEqual([]);
  });
});

describe('startReel integration', { timeout: SLOW_MS }, () => {
  // Fake words with a 1.0s pause (1.0..2.0) and a 0.5s pause (3.0..3.5)
  const FAKE_WORDS: TranscriptWord[] = [
    { text: 'first', start: 0.5, end: 1.0 },
    { text: 'second', start: 2.0, end: 2.6 },
    { text: 'third', start: 2.6, end: 3.0 },
    { text: 'fourth', start: 3.5, end: 4.0 },
  ];

  it('rejects an invalid deadAir value', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const project = openProject(projectDir);
    await expect(project.startReel({ video: 'media/talk.mp4', deadAir: 'extreme' as any })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('leaves v1 uncut and edit list empty when deadAir is not asked for', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const project = openProject(projectDir, { transcriber: async () => FAKE_WORDS });
    const { slug } = await project.startReel({ video: 'media/talk.mp4', title: 'Whole' });
    await project.whenTranscribed(slug);

    const v1Plan = readJson(join(projectDir, 'reels', slug, 'v1', 'plan.json'));
    expect(v1Plan.pieces).toEqual([{ in: 0, out: 12 }]);
    const shots = readJson(join(projectDir, 'reels', slug, 'v1', 'shots.json'));
    expect(shots.duration).toBeCloseTo(12, 2);
    const editList = await project.readEditList(slug);
    expect(editList.operations).toEqual([]);
    const workingPieces = planPieces(applyOperations({ plan: v1Plan, words: FAKE_WORDS }, editList.operations).plan);
    expect(workingPieces).toEqual([{ in: 0, out: 12 }]);
  });

  it('leaves v1 uncut and edit list empty when deadAir is false', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const project = openProject(projectDir, { transcriber: async () => FAKE_WORDS });
    const { slug } = await project.startReel({ video: 'media/talk.mp4', title: 'No Cut', deadAir: false });
    await project.whenTranscribed(slug);

    const v1Plan = readJson(join(projectDir, 'reels', slug, 'v1', 'plan.json'));
    expect(v1Plan.pieces).toEqual([{ in: 0, out: 12 }]);
    const shots = readJson(join(projectDir, 'reels', slug, 'v1', 'shots.json'));
    expect(shots.duration).toBeCloseTo(12, 2);
    const editList = await project.readEditList(slug);
    expect(editList.operations).toEqual([]);
    const workingPieces = planPieces(applyOperations({ plan: v1Plan, words: FAKE_WORDS }, editList.operations).plan);
    expect(workingPieces).toEqual([{ in: 0, out: 12 }]);
  });

  it('builds v1 uncut and adds tagged snip under normal strength', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const project = openProject(projectDir, { transcriber: async () => FAKE_WORDS });
    const { slug } = await project.startReel({ video: 'media/talk.mp4', title: 'Auto Cut', deadAir: 'normal' });
    await project.whenTranscribed(slug);

    // v1 is uncut
    const v1Plan = readJson(join(projectDir, 'reels', slug, 'v1', 'plan.json'));
    expect(v1Plan.pieces).toEqual([{ in: 0, out: 12 }]);
    const shots = readJson(join(projectDir, 'reels', slug, 'v1', 'shots.json'));
    expect(shots.duration).toBeCloseTo(12, 2);

    // Working edit list has one snip matching deadAirCuts
    const expectedCuts = deadAirCuts(FAKE_WORDS, 12, 'normal');
    expect(expectedCuts).toEqual([{ from: 1.08, to: 2 }]);
    const editList = await project.readEditList(slug);
    expect(editList.operations).toMatchObject([
      { kind: 'snip', from: 1.08, to: 2, by: DEAD_AIR_BY },
    ]);

    // Working pieces show the cut stretch is absent
    const workingPieces = planPieces(applyOperations({ plan: v1Plan, words: FAKE_WORDS }, editList.operations).plan);
    expect(workingPieces).toEqual([
      { in: 0, out: 1.08 },
      { in: 2, out: 12 },
    ]);
  });

  it('builds v1 uncut, adds tagged snips under tight strength, and restores cut on removeOperation', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const project = openProject(projectDir, { transcriber: async () => FAKE_WORDS });
    const { slug } = await project.startReel({ video: 'media/talk.mp4', title: 'Tight Cut', deadAir: 'tight' });
    await project.whenTranscribed(slug);

    // v1 is uncut
    const v1Plan = readJson(join(projectDir, 'reels', slug, 'v1', 'plan.json'));
    expect(v1Plan.pieces).toEqual([{ in: 0, out: 12 }]);
    const shots = readJson(join(projectDir, 'reels', slug, 'v1', 'shots.json'));
    expect(shots.duration).toBeCloseTo(12, 2);

    // Edit list has two snips matching deadAirCuts, each tagged with DEAD_AIR_BY
    const expectedCuts = deadAirCuts(FAKE_WORDS, 12, 'tight');
    expect(expectedCuts).toEqual([
      { from: 1.08, to: 2 },
      { from: 3.08, to: 3.5 },
    ]);
    const editList = await project.readEditList(slug);
    expect(editList.operations).toMatchObject([
      { kind: 'snip', from: 1.08, to: 2, by: DEAD_AIR_BY },
      { kind: 'snip', from: 3.08, to: 3.5, by: DEAD_AIR_BY },
    ]);

    // Working pieces have both cuts absent
    const initialPieces = planPieces(applyOperations({ plan: v1Plan, words: FAKE_WORDS }, editList.operations).plan);
    expect(initialPieces).toEqual([
      { in: 0, out: 1.08 },
      { in: 2, out: 3.08 },
      { in: 3.5, out: 12 },
    ]);

    // Removing the first cut restores that stretch while the other snip remains
    const firstCut = editList.operations[0]!;
    expect(firstCut.kind).toBe('snip');
    await project.removeOperation(slug, firstCut.id);

    const updatedList = await project.readEditList(slug);
    expect(updatedList.operations).toHaveLength(1);
    expect(updatedList.operations[0]!.id).toBe(editList.operations[1]!.id);

    // First cut stretch (1.08..2) is present again, second cut (3.08..3.5) is still applied
    const restoredPieces = planPieces(applyOperations({ plan: v1Plan, words: FAKE_WORDS }, updatedList.operations).plan);
    expect(restoredPieces).toEqual([
      { in: 0, out: 3.08 },
      { in: 3.5, out: 12 },
    ]);
  });

  it('keeps both gaps and empty edit list under gentle strength', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const project = openProject(projectDir, { transcriber: async () => FAKE_WORDS });
    const { slug } = await project.startReel({ video: 'media/talk.mp4', title: 'Gentle Cut', deadAir: 'gentle' });
    await project.whenTranscribed(slug);

    const v1Plan = readJson(join(projectDir, 'reels', slug, 'v1', 'plan.json'));
    expect(v1Plan.pieces).toEqual([{ in: 0, out: 12 }]);
    const shots = readJson(join(projectDir, 'reels', slug, 'v1', 'shots.json'));
    expect(shots.duration).toBeCloseTo(12, 2);
    const editList = await project.readEditList(slug);
    expect(editList.operations).toEqual([]);
    const workingPieces = planPieces(applyOperations({ plan: v1Plan, words: FAKE_WORDS }, editList.operations).plan);
    expect(workingPieces).toEqual([{ in: 0, out: 12 }]);
  });

  it('trims an audible breath gap as a tagged snip on Working when waveformPeaks inspects real audio', async () => {
    const projectDir = copyProjectFixture('footage-project');
    const breathFile = join(projectDir, 'media', 'breath.mp4');
    makeBreathVideo(breathFile);

    const breathWords: TranscriptWord[] = [
      { text: 'speaking', start: 1.0, end: 2.0 },
      { text: 'again', start: 2.45, end: 4.0 },
    ];
    const project = openProject(projectDir, { transcriber: async () => breathWords });
    const { slug } = await project.startReel({ video: 'media/breath.mp4', title: 'Breath Reel', deadAir: 'normal' });
    await project.whenTranscribed(slug);

    const v1Plan = readJson(join(projectDir, 'reels', slug, 'v1', 'plan.json'));
    expect(v1Plan.pieces).toEqual([{ in: 0, out: 5 }]);
    const shots = readJson(join(projectDir, 'reels', slug, 'v1', 'shots.json'));
    expect(shots.duration).toBeCloseTo(5, 2);

    const editList = await project.readEditList(slug);
    expect(editList.operations).toMatchObject([
      { kind: 'snip', from: 2.08, to: 2.45, by: DEAD_AIR_BY },
    ]);
    const workingPieces = planPieces(applyOperations({ plan: v1Plan, words: breathWords }, editList.operations).plan);
    expect(workingPieces).toEqual([
      { in: 0, out: 2.08 },
      { in: 2.45, out: 5 },
    ]);
  });
});
