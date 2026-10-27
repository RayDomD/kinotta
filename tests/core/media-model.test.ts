import { describe, expect, it } from 'vitest';
import { applyOperation, applyOperations, captionPhrases, legacyMedia, mediaPlanTimeline, mediaTimeline, mediaWords, placementTime, timelineMoment } from '../../server/core/model.ts';
import type { MediaPlan, Plan } from '../../server/core/model.ts';
import { malformedMediaCases, malformedPlanCases, validCaptionPlans } from '../helpers/media-validation.ts';

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
  it.each(validCaptionPlans())('accepts caption settings $name', ({ value }) => {
    expect(() => mediaPlanTimeline(value as Plan)).not.toThrow();
  });
  it('keeps font and background through a caption move, so a saved edit list replays to the same plan', () => {
    const captions = { font: { family: 'Geist', weight: 800 }, background: 'none' };
    const words = [{ text: 'hello', start: 0.5, end: 0.9 }];
    const moved = applyOperation({ plan: { captions }, words }, { by: 'you', id: 'a', kind: 'caption-position', x: 4, y: 5 });
    expect(moved.plan.captions).toEqual({ ...captions, position: { x: 4, y: 5 } });
  });
  it('keeps an explicit main video duration consistent when its source range is trimmed', () => {
    const media: MediaPlan = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3 }], placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 3, duration: 3 }], sequence: ['take'] };
    const changed = applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'trim', kind: 'placement-change', placement: 'take', changes: { out: 2 } });
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
    const positioned = applyOperation(sources, { by: 'you', id: 'position', kind: 'caption-phrase-position', placement: 'second', at: 1, x: 12, y: -20 });
    expect(positioned.plan.captions).toEqual({ phrases: [{ placement: 'second', at: 1, x: 12, y: -20 }] });
    const retimed = applyOperation(positioned, { by: 'you', id: 'timing', kind: 'word-timing', placement: 'second', at: 1, start: 1.1, end: 1.6 });
    expect(retimed.plan.captions).toEqual({ phrases: [{ placement: 'second', at: 1.1, x: 12, y: -20 }] });
    expect(() => applyOperation(sources, { by: 'you', id: 'ambiguous', kind: 'caption-phrase-position', at: 1, x: 12, y: -20 })).toThrow('placement');
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
    const moved = applyOperation(sources, { by: 'you', id: 'move', kind: 'placement-move', placement: 'repeat', index: 0 });
    const effect = (plan: MediaPlan) => mediaTimeline(plan).placements.find((p) => p.id === 'effect')!;
    expect(effect(moved.plan.media!).at).toBe(5);
    expect(mediaTimeline(moved.plan.media!).placements.find((p) => p.id === 'bed')!.at).toBe(1);
    const split = applyOperation(moved, { by: 'you', id: 'cut', kind: 'placement-split', placement: 'first', at: 2 });
    expect(effect(split.plan.media!).at).toBe(5);
    const shifted = applyOperation(split, { by: 'you', id: 'shift', kind: 'placement-change', placement: 'effect', changes: { at: 4.5 } });
    expect(effect(shifted.plan.media!).at).toBe(4.5);
    const halves = applyOperation(split, { by: 'you', id: 'effect-cut', kind: 'placement-split', placement: 'effect', at: 0.5 });
    expect(mediaTimeline(halves.plan.media!).placements.find((p) => p.id === 'effect~effect-cut')!.at).toBe(5.5);
    const attachedLater = applyOperation(split, { by: 'you', id: 'reattach', kind: 'placement-change', placement: 'effect', changes: { attachment: { placement: 'first~cut', time: 3.5 } } });
    const splitAgain = applyOperation(attachedLater, { by: 'you', id: 'cut-again', kind: 'placement-split', placement: 'first~cut', at: 1 });
    expect(effect(splitAgain.plan.media!)).toMatchObject({ at: 5.5 });
    expect(effect(splitAgain.plan.media!).attachmentBroken).not.toBe(true);
    const gone = applyOperation(split, { by: 'you', id: 'remove', kind: 'placement-remove', placement: 'first~cut' });
    expect(effect(gone.plan.media!)).toMatchObject({ attachmentBroken: true, at: 5 });
    expect(gone.plan.media!.placements.some((p) => p.id === 'effect')).toBe(true);
    const repaired = applyOperation(gone, { by: 'you', id: 'repair', kind: 'placement-change', placement: 'effect', changes: { attachment: null, at: 1 } });
    expect(effect(repaired.plan.media!)).toMatchObject({ at: 1 });
    expect(effect(repaired.plan.media!).attachmentBroken).not.toBe(true);
  });
  it('frames one picture occurrence independently and refuses invalid framing', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3 }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'second', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['first', 'second'],
    };
    const edited = applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'frame', kind: 'placement-change', placement: 'second', changes: { framing: { mode: 'crop', x: 0.5, y: 0 } } });
    expect(edited.plan.media!.placements[1]).toMatchObject({ framing: { mode: 'crop', x: 0.5, y: 0 } });
    expect(edited.plan.media!.placements[0]).not.toHaveProperty('framing');
    expect(media.placements[1]).not.toHaveProperty('framing');
    for (const framing of [{ mode: 'stretch' }, { mode: 'crop', x: -0.1 }, { mode: 'fit', y: 1.1 }, { mode: 'crop', x: NaN }]) {
      expect(() => applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'bad', kind: 'placement-change', placement: 'second', changes: { framing } } as Parameters<typeof applyOperation>[1])).toThrow('framing');
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
    const op = { by: 'you', id: 'fix', kind: 'word-text' as const, placement: 'second', at: 1, text: 'world' };
    const edited = applyOperation({ plan: { media }, words: [] }, op);

    expect(mediaWords(edited.plan.media!).map((w) => [w.text, w.placement])).toEqual([['hello', 'first'], ['world', 'second']]);
    expect(media.sources[0]?.words?.[0]?.text).toBe('hello');
    expect(() => applyOperation({ plan: { media: { ...media, placements: [media.placements[0]!], sequence: ['first'] } }, words: [] }, op)).toThrow('missing');
    expect(() => applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'bad', kind: 'word-text', at: 1, text: 'world' })).toThrow('placement');
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
      { by: 'you', id: 'add', kind: 'placement-add', placement: { id: 'second', role: 'main', source: 'a', in: 0, out: 3 } },
      { by: 'you', id: 'trim', kind: 'placement-change', placement: 'second', changes: { out: 2 } },
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
    const edited = applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'length', kind: 'placement-change', placement: 'still', changes: { duration: 5 } });

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
    const reordered = applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'move', kind: 'placement-move', placement: 'second', index: 0 });
    expect(reordered.plan.media!.sequence).toEqual(['second', 'first']);
    expect(placementTime(mediaTimeline(reordered.plan.media!), 'first', 1)).toBe(3);
    const replaced = applyOperation(reordered, { by: 'you', id: 'replace', kind: 'placement-replace', target: 'second', placement: { id: 'photo-use', role: 'main', source: 'photo', in: 0, out: 0, duration: 4 }, source: { id: 'photo', kind: 'image', path: 'photo.png', duration: 0 } });
    expect(replaced.plan.media!.sequence).toEqual(['photo-use', 'first']);
    expect(replaced.plan.media!.placements.some((p) => p.id === 'second')).toBe(false);
    const removed = applyOperation(replaced, { by: 'you', id: 'remove', kind: 'placement-remove', placement: 'first' });
    expect(removed.plan.media!.sequence).toEqual(['photo-use']);
    expect(removed.plan.media!.sources.map((s) => s.id)).toEqual(['a', 'photo']);
    expect(applyOperation(removed, { by: 'you', id: 'empty', kind: 'placement-remove', placement: 'photo-use' }).plan.duration).toBe(0);
    expect(media.sequence).toEqual(['first', 'second']);
    expect(() => applyOperation(removed, { by: 'you', id: 'lost', kind: 'placement-move', placement: 'first', index: 0 })).toThrow('missing');
    expect(() => applyOperation(removed, { by: 'you', id: 'reuse', kind: 'placement-replace', target: 'photo-use', placement: { id: 'photo-use', role: 'main', source: 'a', in: 0, out: 3 } })).toThrow('new identity');
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
    const edited = applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'fix', kind: 'word-text', placement: 'voice-use', at: 0, text: 'corrected' });
    expect(mediaWords(edited.plan.media!)[1]!.text).toBe('corrected');
  });

  it('retypes and retimes speech only in the selected placement', () => {
    const media: MediaPlan = {
      schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 3, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
      placements: [{ id: 'first', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'second', role: 'main', source: 'a', in: 0, out: 3 }], sequence: ['first', 'second'],
    };
    const edited = applyOperations({ plan: { media }, words: [] }, [
      { by: 'you', id: 'text', kind: 'phrase-text', placement: 'second', from: 1, to: 1.5, text: 'bye' },
      { by: 'you', id: 'time', kind: 'word-timing', placement: 'second', at: 1, start: 1.1, end: 1.6 },
    ]);
    expect(mediaWords(edited.plan.media!).map((word) => [word.text, word.start, word.end])).toEqual([['hello', 1, 1.5], ['bye', 4.1, 4.6]]);
    expect(() => applyOperation({ plan: { media }, words: [] }, { by: 'you', id: 'ambiguous', kind: 'word-timing', at: 1, start: 1.1, end: 1.6 })).toThrow('placement');
  });

  it('replaces a removed main clip with a gap when leaveGap is true, merges adjacent gaps, drops trailing gaps, and preserves rippling for legacy remove', () => {
    const media: MediaPlan = {
      schema: 1,
      sources: [
        { id: 'video', kind: 'video', path: 'video.mp4', duration: 10 },
        { id: 'audio', kind: 'audio', path: 'audio.wav', duration: 10 },
      ],
      placements: [
        { id: 'first', role: 'main', source: 'video', in: 0, out: 3 },
        { id: 'second', role: 'main', source: 'video', in: 0, out: 2 },
        { id: 'third', role: 'main', source: 'video', in: 0, out: 4 },
        { id: 'att-first', role: 'audio', source: 'audio', in: 0, out: 1, at: 1, attachment: { placement: 'first', time: 1 } },
        { id: 'att-second', role: 'audio', source: 'audio', in: 0, out: 1, at: 4, attachment: { placement: 'second', time: 1 } },
      ],
      sequence: ['first', 'second', 'third'],
    };
    const sources = { plan: { media }, words: [] };

    const removedFirst = applyOperation(sources, { by: 'you', id: 'rm-first', kind: 'placement-remove', placement: 'first', leaveGap: true } as unknown as Parameters<typeof applyOperation>[1]);
    const timeline1 = mediaTimeline(removedFirst.plan.media!);
    expect(timeline1.placements.find((p) => p.id === 'second')?.at).toBe(3);
    expect(timeline1.placements.find((p) => p.id === 'third')?.at).toBe(5);
    const attSecond = timeline1.placements.find((p) => p.id === 'att-second')!;
    expect(attSecond.at).toBe(4);
    expect(attSecond.attachmentBroken).toBeFalsy();
    const attFirst = timeline1.placements.find((p) => p.id === 'att-first')!;
    expect(attFirst.attachmentBroken).toBe(true);
    expect(removedFirst.plan.media!.sequence).toHaveLength(3);
    const gap1 = removedFirst.plan.media!.placements.find((p) => p.id === removedFirst.plan.media!.sequence[0]);
    expect(gap1).toMatchObject({ role: 'gap', duration: 3 });

    const removedSecond = applyOperation(removedFirst, { by: 'you', id: 'rm-second', kind: 'placement-remove', placement: 'second', leaveGap: true } as unknown as Parameters<typeof applyOperation>[1]);
    expect(removedSecond.plan.media!.sequence).toHaveLength(2);
    const mergedGap = removedSecond.plan.media!.placements.find((p) => p.id === removedSecond.plan.media!.sequence[0]);
    expect(mergedGap).toMatchObject({ role: 'gap', duration: 5 });
    const timeline2 = mediaTimeline(removedSecond.plan.media!);
    expect(timeline2.placements.find((p) => p.id === 'third')?.at).toBe(5);

    const removedThird = applyOperation(removedSecond, { by: 'you', id: 'rm-third', kind: 'placement-remove', placement: 'third', leaveGap: true } as unknown as Parameters<typeof applyOperation>[1]);
    expect(removedThird.plan.media!.sequence).toEqual([]);
    expect(removedThird.plan.duration).toBe(0);

    const removedLastDirect = applyOperation(sources, { by: 'you', id: 'rm-last', kind: 'placement-remove', placement: 'third', leaveGap: true } as unknown as Parameters<typeof applyOperation>[1]);
    expect(removedLastDirect.plan.media!.sequence).toEqual(['first', 'second']);
    expect(removedLastDirect.plan.media!.placements.some((p) => p.role === 'gap')).toBe(false);

    const rippled = applyOperation(sources, { by: 'you', id: 'rm-legacy', kind: 'placement-remove', placement: 'first' });
    const rippledTimeline = mediaTimeline(rippled.plan.media!);
    expect(rippledTimeline.placements.find((p) => p.id === 'second')?.at).toBe(0);
    expect(rippledTimeline.placements.find((p) => p.id === 'third')?.at).toBe(2);
    expect(rippledTimeline.placements.find((p) => p.id === 'att-second')?.at).toBe(1);
    expect(rippled.plan.media!.sequence).toEqual(['second', 'third']);
  });
});

describe('main sequence keep-gap trims', () => {
  const media: MediaPlan = { schema: 1, sources: [{ id: 'a', kind: 'video', path: 'a.mp4', duration: 10 }], placements: [{ id: 'first', role: 'main', source: 'a', in: 2, out: 6 }, { id: 'second', role: 'main', source: 'a', in: 6, out: 10 }], sequence: ['first', 'second'] };
  const sources = { plan: { media }, words: [] };
  it('shortens either edge without moving later clips and replays legacy trims unchanged', () => {
    const op = { by: 'you', id: 'trim', kind: 'placement-change' as const, placement: 'first', changes: { in: 3, out: 5 }, leaveGap: true };
    const changed = applyOperation(sources, op);
    expect(mediaTimeline(changed.plan.media!).placements.map((p) => [p.role, p.at, p.duration])).toEqual([['gap', 0, 1], ['main', 1, 2], ['gap', 3, 1], ['main', 4, 4]]);
    expect(mediaTimeline(applyOperation(sources, { ...op, leaveGap: undefined }).plan.media!).placements.map((p) => [p.at, p.duration])).toEqual([[0, 2], [2, 4]]);
    expect(mediaTimeline(applyOperations(sources, []).plan.media!).placements.map((p) => [p.at, p.duration])).toEqual([[0, 4], [4, 4]]);
  });
  it('fills only adjacent gaps, clamps to their size, merges repeated trims and drops a trailing gap', () => {
    const trim = (base: Parameters<typeof applyOperation>[0], id: string, placement: string, changes: { in?: number; out?: number }) => applyOperation(base, { by: 'you', id, kind: 'placement-change', placement, changes, leaveGap: true });
    const shorter = trim(sources, 'short', 'first', { in: 3, out: 5 });
    const merged = trim(shorter, 'short-again', 'first', { in: 4, out: 4.5 });
    expect(mediaTimeline(merged.plan.media!).placements.map((p) => [p.role, p.at, p.duration])).toEqual([['gap', 0, 2], ['main', 2, 0.5], ['gap', 2.5, 1.5], ['main', 4, 4]]);
    const extended = trim(merged, 'extend', 'first', { in: 0, out: 9 });
    expect(mediaTimeline(extended.plan.media!).placements.map((p) => [p.id, p.at, p.duration])).toEqual([['first', 0, 4], ['second', 4, 4]]);
    expect(extended.plan.media!.placements[0]).toMatchObject({ in: 2, out: 6 });
    const noSpace = trim(sources, 'extend-blocked', 'first', { in: 0, out: 9 });
    expect(mediaTimeline(noSpace.plan.media!).placements.map((p) => [p.at, p.duration])).toEqual([[0, 4], [4, 4]]);
    const trailing = trim(sources, 'tail', 'second', { out: 9 });
    expect(mediaTimeline(trailing.plan.media!).placements.map((p) => [p.role, p.at, p.duration])).toEqual([['main', 0, 4], ['main', 4, 3]]);
  });
  it('clamps extensions to available source footage and rejects a non-boolean flag', () => {
    const spaced: MediaPlan = { ...media, placements: [{ id: 'leading', role: 'gap', duration: 4 }, ...media.placements, { id: 'trailing-space', role: 'gap', duration: 5 }], sequence: ['leading', 'first', 'trailing-space', 'second'] };
    const extended = applyOperation({ plan: { media: spaced }, words: [] }, { by: 'you', id: 'extend', kind: 'placement-change', placement: 'first', changes: { in: -5, out: 20 }, leaveGap: true });
    expect(extended.plan.media!.placements.find((p) => p.id === 'first')).toMatchObject({ in: 0, out: 10, duration: 10 });
    expect(mediaTimeline(extended.plan.media!).placements.find((p) => p.id === 'second')!.at).toBe(13);
    expect(() => applyOperation(sources, { by: 'you', id: 'invalid', kind: 'placement-change', placement: 'first', changes: { out: 5 }, leaveGap: 'true' } as unknown as Parameters<typeof applyOperation>[1])).toThrow('leaveGap must be a boolean');
  });
  it('maps words from source time after a keep-gap trim and leaves attached inserts on their existing timing rules', () => {
    const speech: MediaPlan = { ...media, sources: [{ ...media.sources[0]!, words: [{ text: 'removed', start: 2, end: 2.5 }, { text: 'kept', start: 3.5, end: 4 }, { text: 'later', start: 7, end: 7.5 }] }], placements: [...media.placements, { id: 'insert', role: 'insert', source: 'a', in: 0, out: 1, at: 1, attachment: { placement: 'first', time: 3.5 } }] };
    const changed = applyOperation({ plan: { media: speech }, words: [] }, { by: 'you', id: 'trim', kind: 'placement-change', placement: 'first', changes: { in: 3, out: 5 }, leaveGap: true });
    expect(mediaWords(changed.plan.media!).map((w) => [w.text, w.start, w.end])).toEqual([['kept', 1.5, 2], ['later', 5, 5.5]]);
    expect(mediaTimeline(changed.plan.media!).placements.find((p) => p.id === 'insert')).toMatchObject({ at: 1.5 });
    expect(mediaTimeline(changed.plan.media!).placements.find((p) => p.id === 'insert')!.attachmentBroken).not.toBe(true);
  });

  it.each(['3', null, false, Infinity, NaN])('refuses malformed keep-gap source bounds: %s', (value) => {
    expect(() => applyOperation(sources, { by: 'you', id: 'invalid-bound', kind: 'placement-change', placement: 'first', changes: { in: value }, leaveGap: true } as unknown as Parameters<typeof applyOperation>[1])).toThrow(expect.objectContaining({ code: 'invalid' }));
  });

});
