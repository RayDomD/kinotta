import { describe, expect, it } from 'vitest';
import { applyOperation } from '../../server/core/model.ts';
import type { NewOperation, Sources } from '../../server/core/model.ts';

/** A native reel: one spoken take, a music bed, a word-linked graphic with a named element, and captions. */
function native(): Sources {
  return {
    plan: {
      duration: 4,
      clips: [{ id: '01', title: 'Card', clip: 'card.html', in: 0.5, out: 1.5, kind: 'full' }],
      captions: { look: 'phrase' },
      media: {
        schema: 1,
        sources: [
          { id: 'a', kind: 'video', path: 'a.mp4', duration: 3, words: [{ text: 'hello', start: 0.5, end: 0.8 }, { text: 'there', start: 0.9, end: 1.2 }] },
          { id: 'music', kind: 'audio', path: 'music.wav', duration: 4 },
        ],
        placements: [{ id: 'take', role: 'main', source: 'a', in: 0, out: 3 }, { id: 'bed', role: 'audio', source: 'music', at: 0, in: 0, out: 4 }],
        sequence: ['take'],
      },
    },
    words: [],
  } as unknown as Sources;
}

/** Each payload a caller could send with a wrong shape or value. None may apply, throw a TypeError, or apply silently. */
const MALFORMED: Array<[string, Record<string, unknown>]> = [
  ['change of an unknown placement', { kind: 'placement-change', placement: 'nope', changes: { gain: 1 } }],
  ['change with null changes', { kind: 'placement-change', placement: 'bed', changes: null }],
  ['change with a string gain', { kind: 'placement-change', placement: 'bed', changes: { gain: '1' } }],
  ['change with a NaN range', { kind: 'placement-change', placement: 'take', changes: { in: Number.NaN } }],
  ['change with a reversed range', { kind: 'placement-change', placement: 'take', changes: { in: 2, out: 1 } }],
  ['change with a negative start', { kind: 'placement-change', placement: 'bed', changes: { at: -1 } }],
  ['removal of a numeric identity', { kind: 'placement-remove', placement: 5 }],
  ['move to a negative index', { kind: 'placement-move', placement: 'take', index: -1 }],
  ['move to a fractional index', { kind: 'placement-move', placement: 'take', index: 0.5 }],
  ['split at NaN', { kind: 'placement-split', placement: 'bed', at: Number.NaN }],
  ['split at a string', { kind: 'placement-split', placement: 'bed', at: '1' }],
  ['add of a null placement', { kind: 'placement-add', placement: null }],
  ['add of an empty placement', { kind: 'placement-add', placement: {} }],
  ['add at a fractional index', { kind: 'placement-add', placement: { id: 'g', role: 'gap', duration: 1 }, index: 0.5 }],
  ['replace with a null placement', { kind: 'placement-replace', target: 'bed', placement: null }],
  ['replace with no target', { kind: 'placement-replace', placement: { id: 'new', role: 'audio', source: 'music', at: 0, in: 0, out: 1 } }],
  ['word text that is a number', { kind: 'word-text', placement: 'take', at: 0.5, text: 5 }],
  ['word text at NaN', { kind: 'word-text', placement: 'take', at: Number.NaN, text: 'hi' }],
  ['word timing reversed', { kind: 'word-timing', placement: 'take', at: 0.5, start: 0.8, end: 0.5 }],
  ['word timing at NaN', { kind: 'word-timing', placement: 'take', at: 0.5, start: Number.NaN, end: 0.8 }],
  ['phrase text that is null', { kind: 'phrase-text', placement: 'take', from: 0.5, to: 1.2, text: null }],
  ['caption position at NaN', { kind: 'caption-position', x: Number.NaN, y: 0 }],
  ['caption position as strings', { kind: 'caption-position', x: '1', y: '2' }],
  ['phrase position at NaN', { kind: 'caption-phrase-position', placement: 'take', at: Number.NaN, x: 0, y: 0 }],
  ['trim of an unknown clip', { kind: 'clip-trim', clip: 'nope', in: 0.5, out: 1 }],
  ['trim to NaN', { kind: 'clip-trim', clip: '01', in: Number.NaN, out: 1 }],
  ['trim reversed', { kind: 'clip-trim', clip: '01', in: 1.4, out: 0.6 }],
  ['attachment to NaN', { kind: 'clip-attachment', clip: '01', placement: 'take', in: Number.NaN, out: 1 }],
  ['split of a numeric clip', { kind: 'clip-split', clip: 5 }],
  ['slide by NaN', { kind: 'clip-slide', clip: '01', placement: 'take', delta: Number.NaN }],
  ['element offset at zero scale', { kind: 'element-offset', clip: '01', element: 'card', x: 0, y: 0, scale: 0 }],
  ['element offset as strings', { kind: 'element-offset', clip: '01', element: 'card', x: '1', y: 0, scale: 1 }],
  ['element offset with an empty element', { kind: 'element-offset', clip: '01', element: '', x: 0, y: 0, scale: 1 }],
];

describe('operation payload boundaries (A1 audit)', () => {
  it.each(MALFORMED)('refuses %s with a readable reason', (_name, payload) => {
    let thrown: unknown;
    try {
      applyOperation(native(), { id: 'op', ...payload } as unknown as NewOperation & { id: string });
    } catch (err) {
      thrown = err;
    }
    expect(thrown, 'applied without complaint').toBeDefined();
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toMatchObject({ code: 'invalid' });
  });
});
