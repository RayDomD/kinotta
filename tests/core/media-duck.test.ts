import { expect, it } from 'vitest';
import { applyOperation, duckSpeechSpans, duckVolume, mixAt } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';

const sources: Sources = { plan: { duration: 8, media: {
  schema: 1, sources: [{ id: 'bed', kind: 'audio', path: 'bed.wav', duration: 8 }],
  placements: [{ id: 'music', role: 'audio', source: 'bed', in: 0, out: 6, at: 2, gain: 0.5 }], sequence: [],
} }, words: [] };

it('ducks the selected bed during joined speech with editable local ramps and restores its level in silence', () => {
  const next = applyOperation(sources, { id: 'duck', kind: 'placement-duck', placement: 'music',
    spans: [{ start: 2, end: 2.3 }, { start: 1, end: 1.8 }], amount: 20, attack: 0.2, release: 0.4 });
  const p = next.plan.media!.placements[0];
  expect(p.role !== 'gap' && p.volume).toEqual([
    { at: 0.8, gain: 0.5 }, { at: 1, gain: 0.05 }, { at: 2.3, gain: 0.05 }, { at: 2.7, gain: 0.5 },
  ]);
  expect(mixAt(next.plan.media!, 3.5, 8)[0].gain).toBeCloseTo(0.05);
  expect(mixAt(next.plan.media!, 2.9, 8)[0].gain).toBeCloseTo(0.275);
  expect(mixAt(next.plan.media!, 5, 8)[0].gain).toBe(0.5);
  expect(sources.plan.media!.placements[0]).not.toHaveProperty('volume');
});

it('clips boundary speech, joins overlapping ramps, and leaves existing points alone when there is no speech', () => {
  const settings = { amount: 20, attack: 0.2, release: 0.4 };
  expect(duckVolume([{ start: -1, end: 1 }, { start: 1.4, end: 2 }, { start: 5, end: 7 }], 6, 1, settings)).toEqual([
    { at: 0, gain: 0.1 }, { at: 2, gain: 0.1 }, { at: 2.4, gain: 1 },
    { at: 4.8, gain: 1 }, { at: 5, gain: 0.1 }, { at: 6, gain: 0.1 },
  ]);
  const withPoints: Sources = { ...sources, plan: { ...sources.plan, media: { ...sources.plan.media!, placements: [{ id: 'music', role: 'audio', source: 'bed', in: 0, out: 6, at: 2, volume: [{ at: 3, gain: 0.3 }] }] } } };
  expect(applyOperation(withPoints, { id: 'silent', kind: 'placement-duck', placement: 'music', spans: [], ...settings })).toEqual(withPoints);
  for (const bad of [{ amount: -1 }, { amount: Infinity }, { attack: 0 }, { release: NaN }]) expect(() => duckVolume([], 6, 1, { ...settings, ...bad })).toThrow(/Ducking/);
  expect(() => duckVolume([{ start: 1, end: NaN }], 6, 1, settings)).toThrow(/Speech spans/);
});

it('uses the chosen speech track after its trim and loop and offsets it to the bed, without caption precedence', () => {
  const media = { ...sources.plan.media!, tracks: [
    { id: 'music-track', name: 'Music', order: 0, gain: 1, mute: false },
    { id: 'voice-track', name: 'Voice', order: 1, gain: 1, mute: false },
  ], sources: [...sources.plan.media!.sources, { id: 'voice', kind: 'audio' as const, path: 'voice.wav', duration: 4, words: [{ text: 'Hello', start: 1, end: 1.5 }, { text: 'there', start: 2, end: 2.5 }] }], placements: [
    { id: 'music', role: 'audio' as const, source: 'bed', track: 'music-track', in: 0, out: 6, at: 2 },
    { id: 'voice-use', role: 'audio' as const, source: 'voice', track: 'voice-track', in: 1, out: 3, at: 3, duration: 4, loop: true, speech: true },
  ] };
  expect(duckSpeechSpans(media, 'music', 'voice-track', 8)).toEqual([
    { start: 1, end: 1.5 }, { start: 2, end: 2.5 }, { start: 3, end: 3.5 }, { start: 4, end: 4.5 },
  ]);
  expect(() => duckSpeechSpans(media, 'music', 'music-track', 8)).toThrow(/separate speech track/);
  expect(duckSpeechSpans({ ...media, tracks: media.tracks.map((track) => ({ ...track, mute: track.id === 'voice-track' })) }, 'music', 'voice-track', 8)).toEqual([]);
  expect(duckSpeechSpans({ ...media, placements: media.placements.map((use) => ({ ...use, mute: use.id === 'voice-use' })) }, 'music', 'voice-track', 8)).toEqual([]);
});
