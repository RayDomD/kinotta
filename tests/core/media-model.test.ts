import { describe, expect, it } from 'vitest';
import { applyOperation, applyOperations, captionPhrases, legacyMedia, mediaPlanTimeline, mediaTimeline, mediaWords, placementTime, timelineMoment } from '../../server/core/model.ts';
import type { MediaPlan, Plan } from '../../server/core/model.ts';
import { malformedMediaCases, malformedPlanCases } from '../helpers/media-validation.ts';

describe('media placement mapping', () => {
  it.each(malformedMediaCases())('rejects $name with a readable model error', ({ value, error }) => {
    expect(() => mediaTimeline(value as MediaPlan)).toThrow(error);
    expect(() => mediaTimeline(value as MediaPlan)).toThrow(expect.objectContaining({ code: 'invalid' }));
  });
  it.each(malformedPlanCases())('rejects a plan with $name with a readable error', ({ value, error }) => {
    expect(() => mediaPlanTimeline(value as unknown as Plan)).toThrow(expect.objectContaining({ code: 'invalid', message: expect.stringContaining(error) }));
  });
  it('accepts the valid plan the malformed ones are made from, including captions given as true', () => {
    const plan = malformedPlanCases()[0]!.value as unknown as Plan;
    expect(() => mediaPlanTimeline({ ...plan, clips: [] })).not.toThrow();
    expect(() => mediaPlanTimeline({ ...plan, clips: [], captions: true } as unknown as Plan)).not.toThrow();
  });
  it('keeps an explicit main video duration consistent when its source range is trimmed', () => {
    const media: MediaPlan = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3 }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 3, duration: 3 }], sequence: ['take'] };
    const changed = applyOperation({ plan: { media }, words: [] }, { id: 'trim', kind: 'placement-change', placement: 'take', changes: { out: 2 } });
    expect(mediaTimeline(changed.plan.media!).duration).toBe(2);
    expect(changed.plan.media!.placements[0]).toMatchObject({ in: 0, out: 2, duration: 2 });
  });
  it('groups live captions at occurrence, pause and clause boundaries and holds only inside one occurrence', () => {
    const words = ['one', 'two', 'three.', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].map((text, i) => ({ text, start: i * 0.2, end: i * 0.2 + 0.1, placement: i < 9 ? 'first' : 'repeat', sourceStart: i * 0.2 }));
    const phrases = captionPhrases(words);
    expect(phrases.map((p) => p.words.map((w) => w.text))).toEqual([['one', 'two', 'three.'], ['four', 'five', 'six', 'seven', 'eight', 'nine'], ['ten']]);
    expect(phrases[0]!.end).toBeCloseTo(0.6);
    expect(phrases[1]!.end).toBeCloseTo(1.7);
    expect(captionPhrases([{ text: 'a', start: 0, end: 0.1, placement: 'first' }, { text: 'b', start: 1, end: 1.1, placement: 'first' }])).toHaveLength(2);
  });
  it('positions a caption phrase in one occurrence and keeps its position attached when the word is retimed', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'second', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['first', 'second'],
    };
    const sources = { plan: { media, captions: true }, words: mediaWords(media) };
    const positioned = applyOperation(sources, { id: 'position', kind: 'caption-phrase-position', placement: 'second', at: 1, x: 12, y: -20 });
    expect(positioned.plan.captions).toEqual({ phrases: [{ placement: 'second', at: 1, x: 12, y: -20 }] });
    const retimed = applyOperation(positioned, { id: 'timing', kind: 'word-timing', placement: 'second', at: 1, start: 1.1, end: 1.6 });
    expect(retimed.plan.captions).toEqual({ phrases: [{ placement: 'second', at: 1.1, x: 12, y: -20 }] });
    expect(() => applyOperation(sources, { id: 'ambiguous', kind: 'caption-phrase-position', at: 1, x: 12, y: -20 })).toThrow('placement');
  });
  it('follows a specific footage moment across reorder and split, flags its removal and repairs to reel time', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 6 }, { id: 'music', kind: 'audio', path: 'music.wav', duration: 1 }],
      placements: [
        { id: 'first', role: 'main', source: 'a', in: 0, out: 4 }, { id: 'repeat', role: 'main', source: 'a', in: 0, out: 2 },
        { id: 'effect', role: 'audio', source: 'music', in: 0, out: 1, at: 3, attachment: { placement: 'first', time: 3 } },
        { id: 'bed', role: 'audio', source: 'music', in: 0, out: 1, at: 1 },
      ], sequence: ['first', 'repeat'],
    };
    const sources = { plan: { media }, words: [] };
    const moved = applyOperation(sources, { id: 'move', kind: 'placement-move', placement: 'repeat', index: 0 });
    const effect = (plan: MediaPlan) => mediaTimeline(plan).placements.find((p) => p.id === 'effect')!;
    expect(effect(moved.plan.media!).at).toBe(5);
    expect(mediaTimeline(moved.plan.media!).placements.find((p) => p.id === 'bed')!.at).toBe(1);
    const split = applyOperation(moved, { id: 'cut', kind: 'placement-split', placement: 'first', at: 2 });
    expect(effect(split.plan.media!).at).toBe(5);
    const shifted = applyOperation(split, { id: 'shift', kind: 'placement-change', placement: 'effect', changes: { at: 4.5 } });
    expect(effect(shifted.plan.media!).at).toBe(4.5);
    const halves = applyOperation(split, { id: 'effect-cut', kind: 'placement-split', placement: 'effect', at: 0.5 });
    expect(mediaTimeline(halves.plan.media!).placements.find((p) => p.id === 'effect~effect-cut')!.at).toBe(5.5);
    const attachedLater = applyOperation(split, { id: 'reattach', kind: 'placement-change', placement: 'effect', changes: { attachment: { placement: 'first~cut', time: 3.5 } } });
    const splitAgain = applyOperation(attachedLater, { id: 'cut-again', kind: 'placement-split', placement: 'first~cut', at: 1 });
    expect(effect(splitAgain.plan.media!)).toMatchObject({ at: 5.5 });
    expect(effect(splitAgain.plan.media!).attachmentBroken).not.toBe(true);
    const gone = applyOperation(split, { id: 'remove', kind: 'placement-remove', placement: 'first~cut' });
    expect(effect(gone.plan.media!)).toMatchObject({ attachmentBroken: true, at: 5 });
    expect(gone.plan.media!.placements.some((p) => p.id === 'effect')).toBe(true);
    const repaired = applyOperation(gone, { id: 'repair', kind: 'placement-change', placement: 'effect', changes: { attachment: null, at: 1 } });
    expect(effect(repaired.plan.media!)).toMatchObject({ at: 1 });
    expect(effect(repaired.plan.media!).attachmentBroken).not.toBe(true);
  });
  it('frames one picture occurrence independently and refuses invalid framing', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3 }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'second', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['first', 'second'],
    };
    const edited = applyOperation({ plan: { media }, words: [] }, { id: 'frame', kind: 'placement-change', placement: 'second', changes: { framing: { mode: 'crop', x: 0.5, y: 0 } } });
    expect(edited.plan.media!.placements[1]).toMatchObject({ framing: { mode: 'crop', x: 0.5, y: 0 } });
    expect(edited.plan.media!.placements[0]).not.toHaveProperty('framing');
    expect(media.placements[1]).not.toHaveProperty('framing');
    for (const framing of [{ mode: 'stretch' }, { mode: 'crop', x: -0.1 }, { mode: 'fit', y: 1.1 }, { mode: 'crop', x: NaN }]) {
      expect(() => applyOperation({ plan: { media }, words: [] }, { id: 'bad', kind: 'placement-change', placement: 'second', changes: { framing } } as Parameters<typeof applyOperation>[1])).toThrow('framing');
    }
  });
  it('distinguishes different takes and repeated uses at the same source second', () => {
    const timeline = mediaTimeline({
      schema: 1,
      sources: [
        { id: 'source-a', kind: 'video', path: 'media/a.mp4', duration: 20 },
        { id: 'source-b', kind: 'video', path: 'media/b.mp4', duration: 20 },
      ],
      placements: [
        { id: 'a-first', role: 'main', source: 'source-a', in: 10, out: 13 },
        { id: 'b-first', role: 'main', source: 'source-b', in: 10, out: 13 },
        { id: 'a-second', role: 'main', source: 'source-a', in: 10, out: 13 },
      ],
      sequence: ['a-first', 'b-first', 'a-second'],
    });

    expect(timeline.duration).toBe(9);
    expect(placementTime(timeline, 'a-first', 11)).toBe(1);
    expect(placementTime(timeline, 'b-first', 11)).toBe(4);
    expect(placementTime(timeline, 'a-second', 11)).toBe(7);
    expect(timelineMoment(timeline, 7)).toEqual({ placement: 'a-second', source: 'source-a', time: 11 });
  });

  it('keeps an intentional blank gap and moves later takes when an earlier take is shortened', () => {
    const timeline = mediaTimeline({
      schema: 1,
      sources: [{ id: 'a', kind: 'video', path: 'media/a.mp4', duration: 20 }],
      placements: [
        { id: 'first', role: 'main', source: 'a', in: 10, out: 12 },
        { id: 'blank', role: 'gap', duration: 4 },
        { id: 'second', role: 'main', source: 'a', in: 10, out: 13 },
      ],
      sequence: ['first', 'blank', 'second'],
    });

    expect(timeline.duration).toBe(9);
    expect(timelineMoment(timeline, 3)).toBeNull();
    expect(placementTime(timeline, 'second', 11)).toBe(7);
    expect(timelineMoment(timeline, 6)).toEqual({ placement: 'second', source: 'a', time: 10 });
    expect(timelineMoment(timeline, 9)).toBeNull();
  });

  it('refuses missing or ambiguous targets instead of silently using another occurrence', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [{ id: 'a', kind: 'video', path: 'media/a.mp4', duration: 20 }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 10, out: 13 }],
      sequence: ['first'],
    };

    expect(() => mediaTimeline({ ...media, sequence: ['missing'] })).toThrow('missing');
    expect(() => mediaTimeline({ ...media, placements: [...media.placements, ...media.placements] })).toThrow('Duplicate placement');
    expect(() => mediaTimeline({ ...media, sources: [...media.sources, ...media.sources] })).toThrow('Duplicate source');
    expect(() => mediaTimeline({ ...media, sequence: ['first', 'first'] })).toThrow('once');
    expect(() => mediaTimeline({ ...media, placements: [{ id: 'first', role: 'main', source: 'missing', in: 0, out: 3 }] })).toThrow('missing');
    expect(() => mediaTimeline({ ...media, placements: [{ id: 'first', role: 'main', source: 'a', in: 19, out: 21 }] })).toThrow('range');
    expect(() => mediaTimeline({ ...media, placements: [{ id: 'first', role: 'gap', duration: -1 }] })).toThrow('duration');
  });

  it('adapts a legacy single-source plan without changing its saved data', () => {
    const plan = {
      video: '../../media/talk.mp4', duration: 12,
      pieces: [{ in: 6, out: 12 }, { in: 0, out: 3 }],
    };
    const before = JSON.stringify(plan);
    const media = legacyMedia(plan)!;
    const timeline = mediaTimeline(media);

    expect(timeline.duration).toBe(9);
    expect(timelineMoment(timeline, 1)?.time).toBe(7);
    expect(timelineMoment(timeline, 7)?.time).toBe(1);
    expect(media.sources[0]?.path).toBe('../../media/talk.mp4');
    expect(legacyMedia({ ...plan, pieces: [...plan.pieces].reverse() })?.placements.map((p) => p.id).sort()).toEqual(media.placements.map((p) => p.id).sort());
    expect(JSON.stringify(plan)).toBe(before);
    expect(legacyMedia({ duration: 5 })).toBeNull();
  });

  it('corrects only the selected reuse and refuses an edit whose placement was removed', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 5, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
      placements: [
        { id: 'first', role: 'main', source: 'a', in: 0, out: 3 },
        { id: 'second', role: 'main', source: 'a', in: 0, out: 3 },
      ],
      sequence: ['first', 'second'],
    };
    const op = { id: 'fix', kind: 'word-text' as const, placement: 'second', at: 1, text: 'world' };
    const edited = applyOperation({ plan: { media }, words: [] }, op);

    expect(mediaWords(edited.plan.media!).map((w) => [w.text, w.placement])).toEqual([['hello', 'first'], ['world', 'second']]);
    expect(media.sources[0]?.words?.[0]?.text).toBe('hello');
    expect(() => applyOperation({ plan: { media: { ...media, placements: [media.placements[0]!], sequence: ['first'] } }, words: [] }, op)).toThrow('missing');
    expect(() => applyOperation({ plan: { media }, words: [] }, { id: 'bad', kind: 'word-text', at: 1, text: 'world' })).toThrow('placement');
  });

  it('keeps added music on reel time and clips it at the shortened main-sequence end', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [
        { id: 'take', kind: 'video', path: 'take.mp4', duration: 12 },
        { id: 'music', kind: 'audio', path: 'music.wav', duration: 2 },
      ],
      placements: [
        { id: 'take-first', role: 'main', source: 'take', in: 0, out: 3 },
        { id: 'song', role: 'audio', source: 'music', in: 0, out: 2, at: 1, duration: 10, loop: true },
      ],
      sequence: ['take-first'],
    };
    const timeline = mediaTimeline(media);

    expect(timeline.duration).toBe(3);
    expect(timeline.placements.find((p) => p.id === 'song')).toMatchObject({ at: 1, duration: 2, source: 'music', loop: true });
    expect(timelineMoment(timeline, 1.5)).toEqual({ placement: 'take-first', source: 'take', time: 1.5 });
    expect(mediaTimeline({ ...media, placements: [media.placements[1]!], sequence: [] }, 8).duration).toBe(8);
  });

  it('adds and trims a repeated use without changing its first use or library source', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 12 }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }],
      sequence: ['first'],
    };
    const edited = applyOperations({ plan: { media }, words: [] }, [
      { id: 'add', kind: 'placement-add', placement: { id: 'second', role: 'main', source: 'a', in: 0, out: 3 } },
      { id: 'trim', kind: 'placement-change', placement: 'second', changes: { out: 2 } },
    ]);

    expect(mediaTimeline(edited.plan.media!).duration).toBe(5);
    expect(edited.plan.media!.placements.map((p) => p.role === 'gap' ? p.duration : p.out)).toEqual([3, 2]);
    expect(edited.plan.media!.sources).toEqual(media.sources);
    expect(mediaTimeline(media).duration).toBe(3);
  });

  it('uses an editable image duration without inventing source speech or playback speed', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [
        { id: 'photo', kind: 'image', path: 'photo.png', duration: 0 },
        { id: 'take', kind: 'video', path: 'take.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }] },
      ],
      placements: [
        { id: 'still', role: 'main', source: 'photo', in: 0, out: 0, duration: 4 },
        { id: 'speech', role: 'main', source: 'take', in: 0, out: 3 },
      ],
      sequence: ['still', 'speech'],
    };
    const edited = applyOperation({ plan: { media }, words: [] }, { id: 'length', kind: 'placement-change', placement: 'still', changes: { duration: 5 } });

    expect(mediaTimeline(edited.plan.media!).duration).toBe(8);
    expect(timelineMoment(mediaTimeline(edited.plan.media!), 3)).toEqual({ placement: 'still', source: 'photo', time: 0 });
    expect(mediaWords(edited.plan.media!).map((w) => [w.text, w.start])).toEqual([['hello', 6]]);
  });

  it('reorders, replaces and removes independent uses while retaining reusable library sources', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 12 }],
      placements: [
        { id: 'first', role: 'main', source: 'a', in: 0, out: 3 },
        { id: 'second', role: 'main', source: 'a', in: 0, out: 2 },
      ], sequence: ['first', 'second'],
    };
    const reordered = applyOperation({ plan: { media }, words: [] }, { id: 'move', kind: 'placement-move', placement: 'second', index: 0 });
    expect(reordered.plan.media!.sequence).toEqual(['second', 'first']);
    expect(placementTime(mediaTimeline(reordered.plan.media!), 'first', 1)).toBe(3);
    const replaced = applyOperation(reordered, { id: 'replace', kind: 'placement-replace', target: 'second', placement: { id: 'photo-use', role: 'main', source: 'photo', in: 0, out: 0, duration: 4 }, source: { id: 'photo', kind: 'image', path: 'photo.png', duration: 0 } });
    expect(replaced.plan.media!.sequence).toEqual(['photo-use', 'first']);
    expect(replaced.plan.media!.placements.some((p) => p.id === 'second')).toBe(false);
    const removed = applyOperation(replaced, { id: 'remove', kind: 'placement-remove', placement: 'first' });
    expect(removed.plan.media!.sequence).toEqual(['photo-use']);
    expect(removed.plan.media!.sources.map((s) => s.id)).toEqual(['a', 'photo']);
    expect(applyOperation(removed, { id: 'empty', kind: 'placement-remove', placement: 'photo-use' }).plan.duration).toBe(0);
    expect(media.sequence).toEqual(['first', 'second']);
    expect(() => applyOperation(removed, { id: 'lost', kind: 'placement-move', placement: 'first', index: 0 })).toThrow('missing');
    expect(() => applyOperation(removed, { id: 'reuse', kind: 'placement-replace', target: 'photo-use', placement: { id: 'photo-use', role: 'main', source: 'a', in: 0, out: 3 } })).toThrow('new identity');
  });

  it('selects voiceover captions over a passage and clips speech at the reel end', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [
        { id: 'take', kind: 'video', path: 'take.mp4', duration: 3, words: [{ text: 'before', start: 0, end: 0.5 }, { text: 'main', start: 1, end: 1.5 }, { text: 'after', start: 2, end: 2.5 }] },
        { id: 'voice', kind: 'audio', path: 'voice.wav', duration: 3, words: [{ text: 'replacement', start: 0, end: 0.5 }, { text: 'late', start: 1.7, end: 2.5 }, { text: 'outside', start: 2.2, end: 2.7 }] },
      ],
      placements: [
        { id: 'main', role: 'main', source: 'take', in: 0, out: 3 },
        { id: 'voice-use', role: 'audio', source: 'voice', in: 0, out: 3, at: 1, duration: 2, speech: true },
      ], sequence: ['main'],
    };
    const words = mediaWords(media);
    expect(words.map((w) => [w.text, w.start, w.end, w.placement])).toEqual([
      ['before', 0, 0.5, 'main'], ['replacement', 1, 1.5, 'voice-use'], ['late', 2.7, 3, 'voice-use'],
    ]);
    const edited = applyOperation({ plan: { media }, words: [] }, { id: 'fix', kind: 'word-text', placement: 'voice-use', at: 0, text: 'corrected' });
    expect(mediaWords(edited.plan.media!)[1]!.text).toBe('corrected');
  });

  it('retypes and retimes speech only in the selected placement', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'second', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['first', 'second'],
    };
    const edited = applyOperations({ plan: { media }, words: [] }, [
      { id: 'text', kind: 'phrase-text', placement: 'second', from: 1, to: 1.5, text: 'bye' },
      { id: 'time', kind: 'word-timing', placement: 'second', at: 1, start: 1.1, end: 1.6 },
    ]);
    expect(mediaWords(edited.plan.media!).map((word) => [word.text, word.start, word.end])).toEqual([['hello', 1, 1.5], ['bye', 4.1, 4.6]]);
    expect(() => applyOperation({ plan: { media }, words: [] }, { id: 'ambiguous', kind: 'word-timing', at: 1, start: 1.1, end: 1.6 })).toThrow('placement');
  });
});
