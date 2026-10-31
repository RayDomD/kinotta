// Plan: docs/plans/2026-10-31-keep-manual-fixes.md. Each test is one cell of "a fix the owner made by hand" against
// "something that processes the reel again". A cell the app gets wrong is `it.fails` with its issue until fixed.
// A fix names its word by start time; when a new run moves the times, it re-anchors to the word that still reads
// what it replaced (`fixedWordIndex`, issue #127).
import { spawnSync } from 'node:child_process';
import { createReadStream, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { fixedWordIndex, REANCHOR_SECONDS } from '../../server/core/_internal/edit-model.ts';
import type { Transcriber, TranscriptWord } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const SLOW_MS = 120_000;
const SLUG = 'founder-talk';
const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
/** The same speech transcribed again: the same words, each start and end a little later, as a new model run gives. */
const shifted = (words: readonly TranscriptWord[], by: number): TranscriptWord[] => words.map((w) => ({ ...w, start: w.start + by, end: w.end + by }));

const FIRST: TranscriptWord[] = [{ text: 'hello', start: 0.2, end: 0.5 }, { text: 'there', start: 0.6, end: 0.9 }];

/** A native-media reel on one imported sound used once as speech, transcribed by `transcriber`, nothing cached yet. */
async function speechReel(transcriber: Transcriber) {
  const dir = copyFixture('footage-project');
  const tone = join(dir, 'tone.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', tone], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const project = openProject(dir, { transcriber });
  const entry = await project.importMedia('Tone.wav', createReadStream(tone));
  const media = (prefix: string) => ({
    schema: 1,
    sources: [{ id: entry.id, name: 'Tone', kind: 'audio', path: prefix + entry.path, duration: 2, contentHash: entry.contentHash }],
    placements: [{ id: 'talk', role: 'audio', source: entry.id, at: 0, in: 0, out: 2, speech: true }],
    sequence: [],
  });
  const reel = join(dir, 'reels', SLUG);
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 2, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Speech', duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], media: media('../../'), clips: [] }));
  return { dir, project, source: entry.id };
}

/** Words the next transcription returns, switchable between runs. */
function scriptedTranscriber(first: TranscriptWord[]) {
  let next = first;
  let calls = 0;
  const transcriber: Transcriber = async () => { calls += 1; return next; };
  return { transcriber, set: (words: TranscriptWord[]) => { next = words; }, calls: () => calls };
}

async function transcribed(project: ReturnType<typeof openProject>, source: string, words: TranscriptWord[]) {
  await project.transcribeMedia(source);
  await expect.poll(() => project.mediaSpeech(source)).toEqual({ state: 'ready', words });
}

const savedTexts = async (project: ReturnType<typeof openProject>, version: number) =>
  (await project.readVersion(SLUG, version)).transcript?.map((w) => w.text);

describe('native media: a word fixed by hand', () => {
  it('is never re-transcribed over: asking again reuses the cached words', async () => {
    const speech = scriptedTranscriber(FIRST);
    const { project, source } = await speechReel(speech.transcriber);
    await transcribed(project, source, FIRST);
    await project.addOperation(SLUG, { kind: 'word-text', placement: 'talk', at: 0.2, text: 'hullo', was: 'hello' });

    speech.set(shifted(FIRST, 0.02));
    expect(await project.transcribeMedia(source)).toEqual({ state: 'ready', words: FIRST });
    expect(speech.calls()).toBe(1);
  });

  const savedThenRetranscribed = async (by: number) => {
    const speech = scriptedTranscriber(FIRST);
    const { dir, project, source } = await speechReel(speech.transcriber);
    await transcribed(project, source, FIRST);
    await project.addOperation(SLUG, { kind: 'word-text', placement: 'talk', at: 0.2, text: 'hullo', was: 'hello' });
    await project.freezeEdits(SLUG);
    rmSync(join(dir, 'footage', '.transcripts'), { recursive: true, force: true });
    speech.set(shifted(FIRST, by));
    await transcribed(project, source, shifted(FIRST, by));
    return project;
  };

  it('stays in its saved version after the source is transcribed again', { timeout: SLOW_MS }, async () => {
    const project = await savedThenRetranscribed(0.02);
    expect(await savedTexts(project, 2)).toEqual(['hullo', 'there']);
  });

  it('stays in the next version after the source is transcribed again with identical times', { timeout: SLOW_MS }, async () => {
    const project = await savedThenRetranscribed(0);
    await project.addOperation(SLUG, { kind: 'placement-change', placement: 'talk', changes: { gain: 0.5 } });
    expect(Object.values((await project.readEditList(SLUG)).flagged ?? {})).toEqual([]);
    await project.freezeEdits(SLUG);
    expect(await savedTexts(project, 3)).toEqual(['hullo', 'there']);
  });

  // Working replays the fix onto the inputs it was first made on, whose words now come from the new run (issue #127).
  it('stays in the next version after the source is transcribed again with times moved by 20 ms', { timeout: SLOW_MS }, async () => {
    const project = await savedThenRetranscribed(0.02);
    await project.addOperation(SLUG, { kind: 'placement-change', placement: 'talk', changes: { gain: 0.5 } });
    await project.freezeEdits(SLUG);
    expect(await savedTexts(project, 3)).toEqual(['hullo', 'there']);
  });

  it('on Working, before any save, survives a fresh transcription whose times are identical', { timeout: SLOW_MS }, async () => {
    const speech = scriptedTranscriber(FIRST);
    const { dir, project, source } = await speechReel(speech.transcriber);
    await transcribed(project, source, FIRST);
    await project.addOperation(SLUG, { kind: 'word-text', placement: 'talk', at: 0.2, text: 'hullo', was: 'hello' });

    rmSync(join(dir, 'footage', '.transcripts'), { recursive: true, force: true });
    await transcribed(project, source, FIRST);

    expect(Object.values((await project.readEditList(SLUG)).flagged ?? {})).toEqual([]);
    await project.freezeEdits(SLUG);
    expect(await savedTexts(project, 2)).toEqual(['hullo', 'there']);
  });

  it('on Working, before any save, survives a fresh transcription whose times moved by 20 ms', { timeout: SLOW_MS }, async () => {
    const speech = scriptedTranscriber(FIRST);
    const { dir, project, source } = await speechReel(speech.transcriber);
    await transcribed(project, source, FIRST);
    await project.addOperation(SLUG, { kind: 'word-text', placement: 'talk', at: 0.2, text: 'hullo', was: 'hello' });

    rmSync(join(dir, 'footage', '.transcripts'), { recursive: true, force: true });
    speech.set(shifted(FIRST, 0.02));
    await transcribed(project, source, shifted(FIRST, 0.02));

    expect(Object.values((await project.readEditList(SLUG)).flagged ?? {})).toEqual([]);
    await project.freezeEdits(SLUG);
    expect(await savedTexts(project, 2)).toEqual(['hullo', 'there']);
  });
});

describe("legacy footage reel: a word fixed by hand, then the reel's transcript.json is written again", () => {
  const rewriteTranscript = (dir: string, by: number) => {
    const file = join(dir, 'reels', SLUG, 'transcript.json');
    const raw = readJson(file);
    writeFileSync(file, JSON.stringify({ ...raw, words: shifted(raw.words, by) }));
  };

  it('keeps the fix in the saved version and the next one when the times are identical', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addOperation(SLUG, { kind: 'word-text', at: 0.4, text: 'imagine', was: 'picture' });
    await project.freezeEdits(SLUG);

    rewriteTranscript(dir, 0);
    await project.addOperation(SLUG, { kind: 'snip', from: 6, to: 7 });
    expect(Object.values((await project.readEditList(SLUG)).flagged ?? {})).toEqual([]);
    await project.freezeEdits(SLUG);
    expect((await savedTexts(project, 2))?.[0]).toBe('imagine');
    expect((await savedTexts(project, 3))?.[0]).toBe('imagine');
  });

  // An agent re-running transcript.py (stages/footage-reel.md step 4) writes new times; Working after a save reads
  // the saved version's own transcript, so the fix holds.
  it('keeps the fix in the next version when the times moved by 20 ms', { timeout: SLOW_MS }, async () => {
    const dir = copyFixture('footage-project');
    const project = openProject(dir);
    await project.addOperation(SLUG, { kind: 'word-text', at: 0.4, text: 'imagine', was: 'picture' });
    await project.freezeEdits(SLUG);

    rewriteTranscript(dir, 0.02);
    await project.addOperation(SLUG, { kind: 'snip', from: 6, to: 7 });
    expect(Object.values((await project.readEditList(SLUG)).flagged ?? {})).toEqual([]);
    await project.freezeEdits(SLUG);
    expect((await savedTexts(project, 3))?.[0]).toBe('imagine');
  });
});

describe('re-anchoring a fix to its word after the times moved', () => {
  const words: TranscriptWord[] = [
    { text: 'picture', start: 0.42, end: 0.7 },
    { text: 'two', start: 0.72, end: 0.95 },
    { text: 'two', start: 0.97, end: 1.2 },
  ];

  it('takes the exact start first, then the nearest word that still reads what the fix replaced', () => {
    expect(fixedWordIndex(words, 0.72, 'picture')).toBe(1);
    expect(fixedWordIndex(words, 0.4, 'picture')).toBe(0);
    expect(fixedWordIndex(words, 0.4, 'Picture,')).toBe(0);
    expect(fixedWordIndex(words, 0.69, 'two')).toBe(1);
  });

  it('refuses a word that reads differently, one out of reach, and a tie it cannot tell apart', () => {
    expect(() => fixedWordIndex(words, 0.4, 'pitcher')).toThrow('There is no word that starts there');
    expect(() => fixedWordIndex(words, 0.42 + REANCHOR_SECONDS + 0.01, 'picture')).toThrow('There is no word that starts there');
    expect(() => fixedWordIndex(words, 0.845, 'two')).toThrow('There is no word that starts there');
  });

  it('without the old text, never re-anchors: the start must match', () => {
    expect(fixedWordIndex(words, 0.42)).toBe(0);
    expect(() => fixedWordIndex(words, 0.4)).toThrow('There is no word that starts there');
  });
});

describe('caption edits after the times moved', () => {
  const words: TranscriptWord[] = [{ text: 'hello', start: 1, end: 1.4 }, { text: 'big', start: 1.5, end: 1.8 }, { text: 'world', start: 1.9, end: 2.3 }];
  const moved = shifted(words, 0.02);
  const legacy = (ws: TranscriptWord[]) => ({ plan: { duration: 4, captions: true as const }, words: ws });

  it('retypes the phrase that still reads what it read, not the words the old span catches', async () => {
    const { applyOperations } = await import('../../server/core/model.ts');
    const op = { id: 'a', by: 'you', kind: 'phrase-text' as const, from: 1, to: 2.3, text: 'hullo big world', was: 'hello big world' };
    expect(applyOperations(legacy(moved), [op]).words.map((w) => [w.text, w.start])).toEqual([['hullo', 1.02], ['big', 1.52], ['world', 1.92]]);
    expect(applyOperations(legacy(words), [op]).words.map((w) => w.text)).toEqual(['hullo', 'big', 'world']);
  });

  it('keeps one caption where it was moved to, found by its first word', async () => {
    const { applyOperations } = await import('../../server/core/model.ts');
    const op = { id: 'a', by: 'you', kind: 'caption-phrase-position' as const, at: 1, x: 10, y: 20, was: 'hello' };
    const placed = applyOperations(legacy(moved), [op]).plan.captions;
    expect(placed).toMatchObject({ phrases: [{ at: 1.02, x: 10, y: 20 }] });
    // Without what it read, it still needs the exact start, as before.
    const { was: _was, ...bare } = op;
    expect(() => applyOperations(legacy(moved), [bare])).toThrow('There is no word that starts there');
  });
});
