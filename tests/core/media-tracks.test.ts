import { describe, expect, it } from 'vitest';
import { applyOperation, mediaTimeline, mediaWithTracks, mixAt } from '../../server/core/model.ts';
import type { MediaPlan, Sources } from '../../server/core/model.ts';
import { replacementFor } from '../../web/src/review/_internal/placement-edits.ts';
import type { MediaEntry } from '../../server/core/index.ts';

const oldMedia: MediaPlan = {
  schema: 1,
  sources: [{ id: 'take', kind: 'video', path: 'take.mov', duration: 4, audio: true }, { id: 'song', kind: 'audio', path: 'song.wav', duration: 4 }],
  placements: [{ id: 'picture', role: 'main', source: 'take', in: 0, out: 4 }, { id: 'music', role: 'audio', source: 'song', at: 0, in: 0, out: 4 }],
  sequence: ['picture'],
};

describe('owner audio tracks', () => {
  it('snips a native main range atomically while its sound and source identity follow the survivors', () => {
    const before: Sources = { plan: { media: { ...oldMedia, placements: [...oldMedia.placements, { id: 'gap', role: 'gap', duration: 1 }], sequence: ['picture', 'gap'] } }, words: [] };
    const after = applyOperation(before, { id: 'snip', kind: 'placement-snip', from: 1, to: 4.5 });
    const media = after.plan.media!;
    expect(mediaTimeline(media).placements.filter((p) => media.sequence.includes(p.id)).map((p) => [p.role, p.at, p.duration])).toEqual([['main', 0, 1], ['gap', 1, 0.5]]);
    expect(media.placements.find((p) => p.id === 'picture')).toMatchObject({ source: 'take', in: 0, out: 1, track: 'track:speech' });
    expect(media.placements.find((p) => p.id === 'music')).toMatchObject({ in: 0, out: 4, at: 0 });
    expect(before.plan.media!.sequence).toEqual(['picture', 'gap']);
    expect(() => applyOperation(before, { id: 'invalid', kind: 'placement-snip', from: 4, to: 3 })).toThrow(/stretch/);
  });
  it('removes track membership when replacing footage with a silent image', () => {
    const media = mediaWithTracks(oldMedia);
    const raw = media.placements.find((p) => p.id === 'picture')!;
    if (raw.role === 'gap') throw new Error('Expected footage.');
    const placed = mediaTimeline(media).placements.find((p) => p.id === 'picture')!;
    const image = { id: 'photo', kind: 'image', path: 'photo.png', duration: 0 } as MediaEntry;
    const replacement = replacementFor(raw, placed, image, 'new-picture');
    const after = applyOperation({ plan: { media }, words: [] }, { id: 'replace', kind: 'placement-replace', target: 'picture', placement: replacement, source: image });
    expect(after.plan.media!.placements.find((p) => p.id === 'new-picture')).toMatchObject({ role: 'main', source: 'photo' });
    expect(replacement.track).toBeUndefined();
    expect(mixAt(after.plan.media!, 2).map((sample) => sample.placement)).toEqual(['music']);
  });
  it('supplies stable defaults without modifying a frozen old model or its mix', () => {
    const bytes = JSON.stringify(oldMedia);
    const media = mediaWithTracks(oldMedia);
    expect(media.tracks?.map((t) => t.name)).toEqual(['Speech', 'song']);
    expect(media.placements.map((p) => p.role === 'gap' ? undefined : p.track)).toEqual(['track:speech', 'track:music']);
    expect(mixAt(media, 2)).toEqual(mixAt(oldMedia, 2));
    expect(JSON.stringify(oldMedia)).toBe(bytes);
    expect(mediaWithTracks(media)).toBe(media);
  });

  it('multiplies the entire clip envelope by track gain and keeps track Solo preview only', () => {
    const media = mediaWithTracks(oldMedia);
    media.tracks = media.tracks!.map((t) => ({ ...t, gain: t.id === 'track:music' ? 0.5 : 1 }));
    media.placements = media.placements.map((p) => p.id === 'music' ? { ...p, gain: 2, volume: [{ at: 4, gain: 0 }], fadeIn: 2 } : p);
    expect(mixAt(media, 1, 0, [], ['track:music'])).toEqual([{ placement: 'music', source: 'song', time: 1, gain: 0.375 }]);
    expect(mixAt(media, 1).length).toBe(2);
    media.tracks[1].mute = true;
    expect(mixAt(media, 1).map((p) => p.placement)).toEqual(['picture']);
    expect(mixAt(media, 1, 0, [], ['track:music'])).toEqual([]);
  });

  it('adds, renames, reorders and removes empty tracks, moves sound, and preserves picture locking on split', () => {
    let sources: Sources = { plan: { media: oldMedia }, words: [] };
    sources = applyOperation(sources, { id: 'add', kind: 'track-add', track: { id: 'voice', name: 'Voiceover', order: 2, gain: 1, mute: false } });
    sources = applyOperation(sources, { id: 'rename', kind: 'track-change', track: 'voice', changes: { name: 'Narration', gain: 0.8 } });
    sources = applyOperation(sources, { id: 'move', kind: 'placement-change', placement: 'picture', changes: { track: 'voice' } });
    sources = applyOperation(sources, { id: 'order', kind: 'track-move', track: 'voice', index: 0 });
    expect(sources.plan.media!.tracks![0]).toMatchObject({ id: 'voice', name: 'Narration', gain: 0.8, order: 0 });
    expect(() => applyOperation(sources, { id: 'remove', kind: 'track-remove', track: 'voice' })).toThrow(/empty/i);
    sources = applyOperation(sources, { id: 'split', kind: 'placement-split', placement: 'picture', at: 2 });
    expect(sources.plan.media!.placements.filter((p) => p.role === 'main').map((p) => p.role === 'main' && p.track)).toEqual(['voice', 'voice']);
    sources = applyOperation(sources, { id: 'remove', kind: 'track-remove', track: 'track:speech' });
    expect(sources.plan.media!.tracks!.some((t) => t.id === 'track:speech')).toBe(false);
  });

  it('detaches insert sound at its resolved start and leaves its picture silent', () => {
    const media = mediaWithTracks({ ...oldMedia, placements: [...oldMedia.placements, { id: 'insert', role: 'insert', source: 'take', at: 1, in: 1, out: 3, mute: false, gain: 0.5, fadeIn: 0.2 }] });
    const before = { plan: { media }, words: [] };
    const after = applyOperation(before, { id: 'detach', kind: 'placement-detach', placement: 'insert', track: 'track:music' });
    expect(after.plan.media!.placements.find((p) => p.id === 'insert')).toMatchObject({ role: 'insert', mute: true });
    expect(after.plan.media!.placements.find((p) => p.id === 'insert~detach')).toMatchObject({ role: 'audio', track: 'track:music', at: 1, in: 1, out: 3, gain: 0.5, fadeIn: 0.2, attachment: null });
    const sum = (m: MediaPlan) => mixAt(m, 2).reduce((gain, sample) => gain + sample.gain, 0);
    expect(sum(after.plan.media!)).toBe(sum(media));
    const moved = applyOperation(after, { id: 'move-picture', kind: 'placement-change', placement: 'insert', changes: { at: 0 } });
    expect(mediaTimeline(moved.plan.media!).placements.find((p) => p.id === 'insert~detach')!.at).toBe(1);
  });
});
