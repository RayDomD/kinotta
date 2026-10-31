// Plan: docs/plans/2026-10-31-stressed-word-captions.md, step 5.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOperations, describeOperation } from '../../server/core/model.ts';
import type { NewOperation, Operation, Sources } from '../../server/core/model.ts';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const legacy: Sources = { plan: { duration: 4, captions: true }, words: [{ text: 'hello', start: 1, end: 1.4 }, { text: 'world', start: 1.5, end: 2 }] };
const native: Sources = { plan: { duration: 4, captions: { look: 'phrase' }, media: { schema: 1,
  sources: [{ id: 'take', kind: 'video', path: 'take.mp4', duration: 4, words: [{ text: 'hello', start: 1, end: 1.4 }, { text: 'world', start: 1.5, end: 2 }] }],
  placements: [{ id: 'first', role: 'main', source: 'take', in: 0, out: 4 }], sequence: ['first'] } }, words: [] };
const ops = (...edits: NewOperation[]): Operation[] => edits.map((e, i) => ({ ...e, id: `op${i}`, by: 'you' }) as Operation);
const emphasisOf = (s: Sources) => (typeof s.plan.captions === 'object' ? s.plan.captions.emphasis : undefined);

describe('word-emphasis', () => {
  it('sets a word apart and back, on a legacy reel and on a native placement', () => {
    expect(emphasisOf(applyOperations(legacy, ops({ kind: 'word-emphasis', at: 1.5, on: true, was: 'world' })))).toEqual([{ at: 1.5 }]);
    const on = applyOperations(native, ops({ kind: 'word-emphasis', placement: 'first', at: 1, on: true, was: 'hello' }));
    expect(emphasisOf(on)).toEqual([{ at: 1, placement: 'first' }]);
    const off = applyOperations(native, ops({ kind: 'word-emphasis', placement: 'first', at: 1, on: true }, { kind: 'word-emphasis', placement: 'first', at: 1, on: false }));
    expect(off.plan.captions).toEqual({ look: 'phrase' });
    // Captions stay on, with nothing set apart, once the last word is back in line.
    const back = applyOperations(legacy, ops({ kind: 'word-emphasis', at: 1, on: true }, { kind: 'word-emphasis', at: 1, on: false }));
    expect(back.plan.captions).toBeTruthy();
    expect(emphasisOf(back)).toBeUndefined();
  });

  it('refuses a second set-apart, a word not set apart, a missing word and captions that are off', () => {
    expect(() => applyOperations(legacy, ops({ kind: 'word-emphasis', at: 1, on: true }, { kind: 'word-emphasis', at: 1, on: true }))).toThrow('already set apart');
    expect(() => applyOperations(legacy, ops({ kind: 'word-emphasis', at: 1, on: false }))).toThrow('not set apart');
    expect(() => applyOperations(legacy, ops({ kind: 'word-emphasis', at: 3, on: true }))).toThrow('There is no word that starts there');
    expect(() => applyOperations({ ...legacy, plan: { duration: 4 } }, ops({ kind: 'word-emphasis', at: 1, on: true }))).toThrow('Captions are off');
    expect(() => applyOperations(native, ops({ kind: 'word-emphasis', at: 1, on: true }))).toThrow('placement identity');
  });

  it('follows its word when the word is re-timed, and finds a moved word by what it read', () => {
    const retimed = applyOperations(legacy, ops({ kind: 'word-emphasis', at: 1, on: true }, { kind: 'word-timing', at: 1, start: 0.9, end: 1.3 }));
    expect(emphasisOf(retimed)).toEqual([{ at: 0.9 }]);
    const moved: Sources = { ...legacy, words: legacy.words.map((w) => ({ ...w, start: w.start + 0.02, end: w.end + 0.02 })) };
    expect(emphasisOf(applyOperations(moved, ops({ kind: 'word-emphasis', at: 1, on: true, was: 'hello' })))).toEqual([{ at: 1.02 }]);
  });

  it('reads on the Edits card', () => {
    expect(describeOperation({ id: 'a', by: 'you', kind: 'word-emphasis', at: 1, on: true, was: 'hello' })).toEqual({ target: 'Word', text: 'Set “hello” apart' });
    expect(describeOperation({ id: 'a', by: 'you', kind: 'word-emphasis', at: 1, on: false })).toEqual({ target: 'Word', text: 'Put the word back in line' });
  });

  it('is saved into the next version through the edit list', { timeout: 120_000 }, async () => {
    // The footage sample with a plan of its own in the reel folder and captions on, as save-review-fixes builds it.
    const dir = copyFixture('footage-project');
    const plan = JSON.parse(readFileSync(join(dir, 'motion/plan.json'), 'utf8'));
    const fragments = readdirSync(join(dir, 'motion/clips'));
    plan.video = '../../media/talk.mp4';
    plan.captions = true;
    plan.transcript = 'transcript.json';
    plan.clips = plan.clips.map((c: { id: string }) => ({ ...c, clip: `../../motion/clips/${fragments.find((f) => f.startsWith(`${c.id}-`))}` }));
    writeFileSync(join(dir, 'reels/founder-talk/plan.json'), JSON.stringify(plan));
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'word-emphasis', at: 0.4, on: true, was: 'picture' });
    await project.freezeEdits('founder-talk');
    const v2 = await project.readVersion('founder-talk', 2);
    expect(v2.captions).toMatchObject({ emphasis: [{ at: 0.4 }] });
    expect(readFileSync(join(dir, 'reels/founder-talk/v2/index.html'), 'utf8')).toMatch(/data-source-start="0\.4" data-kind="key">picture</);
  });
});
