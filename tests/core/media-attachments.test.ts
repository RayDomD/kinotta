import { expect, it } from 'vitest';
import { applyOperation, mediaPlanTimeline } from '../../server/core/model.ts';
import type { Plan } from '../../server/core/model.ts';

const plan: Plan = {
  duration: 6,
  media: {
    schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 4 }],
    placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 2 }, { id: 'gap', role: 'gap', duration: 2 }, { id: 'later', origin: 'take', role: 'main', source: 'a', in: 2, out: 4 }],
    sequence: ['take', 'gap', 'later'],
  },
  sections: [{ id: 'topic', name: 'Topic', placement: 'take', start: 0, end: 4 }],
  clips: [{ id: 'graphic', placement: 'take', in: 1, out: 3, section: 'topic' }, { id: 'early', placement: 'take', in: 0, out: 1, section: 'topic' }],
};

it('keeps every continuous section part and flags an interrupted graphic instead of choosing its longest stretch', () => {
  const mapped = mediaPlanTimeline(plan);
  expect(mapped.sections?.map((s) => [s.start, s.end, s.partOf])).toEqual([[0, 2, 'topic'], [4, 6, 'topic']]);
  expect(new Set(mapped.sections?.map((s) => s.id)).size).toBe(2);
  expect(mapped.clips?.find((c) => c.id === 'graphic')).toMatchObject({ attachmentBroken: true });
  expect(mapped.clips?.find((c) => c.id === 'early')).toMatchObject({ in: 0, out: 1, section: mapped.sections![0]!.id });
  expect(plan.sections).toEqual([{ id: 'topic', name: 'Topic', placement: 'take', start: 0, end: 4 }]);
});

it('joins an ordinary cut without breaking attachments and refuses removed graphic words', () => {
  const joined: Plan = { ...plan, media: { ...plan.media!, sequence: ['take', 'later'] } };
  expect(mediaPlanTimeline(joined).sections?.map((s) => [s.id, s.start, s.end])).toEqual([['topic', 0, 4]]);
  expect(mediaPlanTimeline(joined).clips?.find((c) => c.id === 'graphic')).toMatchObject({ in: 1, out: 3 });
  expect(mediaPlanTimeline(joined).clips?.find((c) => c.id === 'graphic')?.attachmentBroken).not.toBe(true);
  const trimmed: Plan = { ...joined, media: { ...joined.media!, placements: joined.media!.placements.map((p) => p.id === 'take' ? { ...p, in: 1.5 } : p) } };
  expect(mediaPlanTimeline(trimmed).clips?.find((c) => c.id === 'graphic')?.attachmentBroken).toBe(true);
});

it('repairs a graphic by explicitly choosing a surviving placement and range', () => {
  const repaired = applyOperation({ plan, words: [] }, { id: 'repair', kind: 'clip-attachment', clip: 'graphic', placement: 'later', in: 2, out: 3 });
  expect(mediaPlanTimeline(repaired.plan).clips?.find((c) => c.id === 'graphic')).toMatchObject({ in: 4, out: 5, attachmentBroken: false });
  expect(() => applyOperation({ plan, words: [] }, { id: 'bad', kind: 'clip-attachment', clip: 'graphic', placement: 'gone', in: 2, out: 3 })).toThrow('attachment');
});

it('splits an interrupted graphic into all surviving parts only on an explicit operation', () => {
  const repaired = applyOperation({ plan, words: [] }, { id: 'repair', kind: 'clip-split', clip: 'graphic' });
  const clips = mediaPlanTimeline(repaired.plan).clips!.filter((c) => c.id === 'graphic' || c.splitFrom === 'graphic');
  expect(clips.map((c) => [c.in, c.out, c.attachmentBroken])).toEqual([[1, 2, false], [4, 5, false]]);
  expect(new Set(clips.map((c) => c.id)).size).toBe(2);
  expect(plan.clips!.filter((c) => c.id === 'graphic')).toHaveLength(1);
});

it('trims attached graphics in source seconds even when the reel is shorter than those timestamps', () => {
  const short: Plan = { duration: 2, media: { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 20 }], placements: [{ id: 'take', role: 'main', source: 'a', in: 10, out: 12 }], sequence: ['take'] }, clips: [{ id: 'g', placement: 'take', in: 10.2, out: 11.8 }] };
  const trimmed = applyOperation({ plan: short, words: [] }, { id: 'trim', kind: 'clip-trim', clip: 'g', in: 10.5, out: 11.5 });
  expect(mediaPlanTimeline(trimmed.plan).clips?.[0]).toMatchObject({ in: 0.5, out: 1.5, attachmentBroken: false });
  const slid = applyOperation({ plan: short, words: [] }, { id: 'slide', kind: 'clip-slide', clip: 'g', delta: 0.1 });
  const mapped = mediaPlanTimeline(slid.plan).clips![0]!;
  expect(mapped.in).toBeCloseTo(0.3);
  expect(mapped.out).toBeCloseTo(1.9);
  expect(mapped.attachmentBroken).toBe(false);
});

it('keeps attachments made on a split half when that half is split and removed again', () => {
  const anchored: Plan = { ...plan, sections: [{ id: 'late', name: 'Late', placement: 'later', start: 2, end: 4 }], clips: [{ id: 'late', placement: 'later', in: 3, out: 4 }], captions: { phrases: [{ placement: 'later', at: 3.2, x: 10, y: 20 }] } };
  const split = applyOperation({ plan: anchored, words: [] }, { id: 'cut', kind: 'placement-split', placement: 'later', at: 1 });
  const removed = applyOperation(split, { id: 'remove', kind: 'placement-remove', placement: 'later' });
  expect(mediaPlanTimeline(removed.plan).clips?.[0]).toMatchObject({ in: 4, out: 5, attachmentBroken: false });
  expect(mediaPlanTimeline(removed.plan).sections?.map((s) => [s.start, s.end])).toEqual([[4, 5]]);
  expect(removed.plan.captions).toMatchObject({ phrases: [{ placement: 'later~cut', at: 3.2, x: 10 }] });
});

it('follows selected voiceover ranges and flags words clipped by the placement duration', () => {
  const voice: Plan = { duration: 8, media: { schema: 1, sources: [{ id: 'v', kind: 'audio', path: 'voice.wav', duration: 12 }], placements: [{ id: 'voice', role: 'audio', source: 'v', in: 5, out: 9, at: 1, duration: 2, speech: true }], sequence: [] }, sections: [{ id: 'topic', name: 'Topic', placement: 'voice', start: 5, end: 9 }], clips: [{ id: 'whole', placement: 'voice', in: 6, out: 8 }, { id: 'kept', placement: 'voice', in: 5.5, out: 6.5 }] };
  const mapped = mediaPlanTimeline(voice);
  expect(mapped.sections?.map((s) => [s.start, s.end])).toEqual([[1, 3]]);
  expect(mapped.clips?.[0]?.attachmentBroken).toBe(true);
  expect(mapped.clips?.[1]).toMatchObject({ in: 1.5, out: 2.5, attachmentBroken: false });
  const shifted = applyOperation({ plan: voice, words: [] }, { id: 'move', kind: 'placement-change', placement: 'voice', changes: { at: 4 } });
  expect(mediaPlanTimeline(shifted.plan).clips?.[1]).toMatchObject({ in: 4.5, out: 5.5 });
});

/** A looping voiceover selected as speech: cycles start at 1, 3 and 5, and the reel ends at 6. */
const looping: Plan = {
  duration: 6,
  media: {
    schema: 1,
    sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 6 }, { id: 'v', kind: 'audio', path: 'v.wav', duration: 2 }],
    placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 6 }, { id: 'voice', role: 'audio', source: 'v', at: 1, in: 0, out: 2, duration: 5, loop: true, speech: true }],
    sequence: ['take'],
  },
  sections: [{ id: 'chorus', name: 'Chorus', placement: 'voice', start: 0, end: 2, cycle: 1 }],
  clips: [
    { id: 'second', placement: 'voice', in: 0.5, out: 1.5, cycle: 1 },
    { id: 'unnamed', placement: 'voice', in: 0.5, out: 1.5 },
    { id: 'cut-off', placement: 'voice', in: 0.5, out: 1.5, cycle: 2 },
  ],
};

it('maps a looping speech attachment only to the cycle it names, never guessing one (A2)', () => {
  const mapped = mediaPlanTimeline(looping);
  expect(mapped.clips?.find((c) => c.id === 'second')).toMatchObject({ in: 3.5, out: 4.5, attachmentBroken: false });
  // No cycle named on a loop: the graphic stays flagged for an explicit repair.
  expect(mapped.clips?.find((c) => c.id === 'unnamed')).toMatchObject({ attachmentBroken: true });
  // The third cycle is cut at the reel end, so the graphic's words are interrupted.
  expect(mapped.clips?.find((c) => c.id === 'cut-off')).toMatchObject({ attachmentBroken: true });
  expect(mapped.sections?.map((s) => [s.id, s.start, s.end])).toEqual([['chorus', 3, 5]]);
});

it('repairs a graphic onto a named cycle of a looping voice, and refuses a cycle that is not there', () => {
  const sources = { plan: looping, words: [] };
  const repaired = applyOperation(sources, { id: 'fix', kind: 'clip-attachment', clip: 'unnamed', placement: 'voice', in: 0.2, out: 1.2, cycle: 0 });
  expect(mediaPlanTimeline(repaired.plan).clips?.find((c) => c.id === 'unnamed')).toMatchObject({ in: 1.2, out: 2.2, attachmentBroken: false });
  expect(repaired.plan.clips?.find((c) => c.id === 'unnamed')).toMatchObject({ cycle: 0 });
  expect(() => applyOperation(sources, { id: 'fix', kind: 'clip-attachment', clip: 'unnamed', placement: 'voice', in: 0.2, out: 1.2 })).toThrow('interrupted');
  expect(() => applyOperation(sources, { id: 'fix', kind: 'clip-attachment', clip: 'unnamed', placement: 'voice', in: 0.2, out: 1.2, cycle: 4 })).toThrow('interrupted');
  expect(() => applyOperation(sources, { id: 'fix', kind: 'clip-attachment', clip: 'unnamed', placement: 'voice', in: 0.2, out: 1.2, cycle: 0.5 })).toThrow('cycle');
  // A repair onto a non-looping placement drops a cycle the clip had.
  const main = applyOperation({ plan: { ...looping, clips: [{ id: 'second', placement: 'voice', in: 0.5, out: 1.5, cycle: 1 }] }, words: [] }, { id: 'fix', kind: 'clip-attachment', clip: 'second', placement: 'take', in: 2, out: 3 });
  expect(main.plan.clips?.[0]).not.toHaveProperty('cycle');
});
