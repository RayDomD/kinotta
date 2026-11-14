import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GRADE_SPEC } from '../../server/core/model.ts';
import { parse } from 'node-html-parser';
import type { ReviewProps } from '../../web/src/review/_internal/Review.tsx';
import { ColourView, gradeDifference } from '../../web/src/review/_internal/ColourView.tsx';
import { ColourScrub, ColourWheel, puckFromRgb, rgbFromPuck } from '../../web/src/review/_internal/ColourWheel.tsx';
import { editPlayhead, rememberEditPlayhead } from '../../web/src/review/_internal/playhead-memory.ts';

describe('Colour grade gestures', () => {
  it('preserves stored RGB without writing the wheel projection back', () => {
    const stored: [number, number, number] = [0.7, -0.6, 0.4];
    const puck = puckFromRgb(stored);
    expect(Math.hypot(...puck)).toBeCloseTo(1);
    expect(stored).toEqual([0.7, -0.6, 0.4]);
    expect(puckFromRgb([0, 0, 0])).toEqual([0, -0]);
  });
  it('clamps wheel gestures and preserves direction through projection', () => {
    expect(rgbFromPuck([0, -2])).toEqual([0.4, -0.2, -0.2]);
    const puck = puckFromRgb(rgbFromPuck([0.3, -0.4]));
    expect(puck[0]).toBeCloseTo(0.3, 2);
    expect(puck[1]).toBeCloseTo(-0.4, 2);
  });
  it('keeps the shared RGB component when a wheel moves and clamps channels to the grade range', () => {
    const neutral: [number, number, number] = [0.1, 0.1, 0.1];
    rgbFromPuck([0, 0], neutral).forEach((channel) => expect(channel).toBeCloseTo(0.1, 12));
    const moved = rgbFromPuck([0, -1], neutral);
    moved.forEach((channel, index) => expect(channel).toBeCloseTo([0.5, -0.1, -0.1][index], 12));
    expect(moved.reduce((sum, channel) => sum + channel, 0) / 3).toBeCloseTo(0.1, 12);
    let current = neutral;
    for (const puck of [[0.3, -0.4], [-0.5, 0.1], [0.05, 0]] as [number, number][]) {
      current = rgbFromPuck(puck, current);
      expect(current.reduce((sum, channel) => sum + channel, 0) / 3).toBeCloseTo(0.1, 12);
    }
    rgbFromPuck([0, -1], [0.9, 0.9, 0.9]).forEach((channel, index) => expect(channel).toBeCloseTo([1, 0.85, 0.85][index], 12));
    rgbFromPuck([0, 1], [-0.9, -0.9, -0.9]).forEach((channel, index) => expect(channel).toBeCloseTo([-1, -0.85, -0.85][index], 12));
  });
  it('returns to the same shared RGB after stepping a wheel to the range limit and back', () => {
    const spec = GRADE_SPEC.shadowsColor;
    const mean = (rgb: number[]) => rgb.reduce((sum, channel) => sum + channel, 0) / 3;
    const step = (current: [number, number, number], dy: number) => {
      const [x, y] = puckFromRgb(current);
      return rgbFromPuck([x, y + dy * 0.05], current, spec);
    };
    let current: [number, number, number] = [0.9, 0.9, 0.9];
    for (const dy of [-1, -1, -1, -1, -1, -1, 1, 1, 1, 1, 1, 1]) {
      current = step(current, dy);
      expect(mean(current)).toBeCloseTo(0.9, 9);
      current.forEach((channel) => { expect(channel).toBeGreaterThanOrEqual(spec.min); expect(channel).toBeLessThanOrEqual(spec.max); });
    }
  });
  it('leaves an unclamped puck unchanged', () => {
    rgbFromPuck([0, -1], [0.1, 0.1, 0.1]).forEach((channel, index) => expect(channel).toBeCloseTo([0.5, -0.1, -0.1][index], 12));
  });
  it('names the reason on disabled controls and keeps plain names when enabled', () => {
    const noop = () => undefined;
    const gesture = { touched: false, onCommit: noop, onReset: noop, onChange: noop };
    const markup = (disabled: boolean, disabledReason?: string) => renderToStaticMarkup(createElement('div', null,
      createElement(ColourScrub, { ...gesture, gradeKey: 'exposure', label: 'Exposure', value: 0, disabled, disabledReason }),
      createElement(ColourWheel, { ...gesture, title: 'Lift', gradeKey: 'shadowsColor', value: [0, 0, 0], disabled, disabledReason })));
    const reason = 'unavailable because v1 is read-only';
    const off = markup(true, reason);
    expect(off).toContain(`aria-label="Exposure, ${reason}"`);
    expect(off).toContain(`aria-label="Exposure value, ${reason}"`);
    expect(off).toContain(`aria-label="Lift colour, ${reason}"`);
    const on = markup(false);
    expect(on).toContain('aria-label="Exposure"');
    expect(on).toContain('aria-label="Exposure value"');
    expect(on).toContain('aria-label="Lift colour"');
    expect(on).not.toContain('unavailable');
  });
  it('commits only changed keys and treats omitted values as neutral', () => {
    expect(gradeDifference({ temperature: 8000, shadowsColor: [0.2, 0, -0.2] }, { temperature: 8000, shadowsColor: [0.2, 0, -0.2], exposure: 0.6 })).toEqual({ exposure: 0.6 });
    expect(gradeDifference({ exposure: 1 }, {})).toEqual({ exposure: null });
    expect(gradeDifference({}, { exposure: 0, contrast: 1, shadowsColor: [0, 0, 0] })).toEqual({});
  });
  it('remembers the Edit playhead per reel and refuses nonfinite times', () => {
    rememberEditPlayhead('colour-a', 7.25);
    rememberEditPlayhead('colour-b', 2);
    rememberEditPlayhead('colour-a', NaN);
    expect(editPlayhead('colour-a')).toBe(7.25);
    expect(editPlayhead('colour-b')).toBe(2);
    expect(editPlayhead('colour-missing')).toBe(0);
  });
});

describe('Colour disabled control names', () => {
  const props = (): ReviewProps => ({
    reel: { slug: 'colour-names', title: 'Colour names', newestVersion: 2, lastChange: 0 },
    state: 'ready', comments: [], frozen: false,
    version: {
      number: 2, workingBase: 1, isNewest: true, agentRegenerate: false, duration: 10,
      shots: [], overlays: [], sections: [], issues: [],
      media: {
        schema: 1,
        sources: [{ id: 'source', kind: 'video', path: 'picture.mp4', duration: 10 }],
        placements: [{ id: 'picture', role: 'main', source: 'source', in: 0, out: 10 }],
        sequence: ['picture'],
      },
    },
    edits: {
      list: { base: 1, operations: [], canUndo: false, canRedo: false }, busy: false, error: null,
      add: async () => true, remove: async () => {}, undo: async () => {}, redo: async () => {},
      cancelHandoff: async () => {}, dismissSkipped: async () => {},
    },
  });
  const render = (input: ReviewProps) => parse(renderToStaticMarkup(createElement(ColourView, input)));
  const gradeNames = ['Black', 'Mid', 'White', 'Exposure', 'Temperature', 'Tint', 'Contrast', 'Saturation'].flatMap((name) => [name, `${name} value`]).concat(['Lift colour', 'Gamma colour', 'Gain colour', 'Reset grade']);
  const expectGradeReason = (input: ReviewProps, reason: string) => {
    const controls = render(input).querySelectorAll('[aria-disabled="true"], [disabled]');
    const names = controls.map((control) => control.getAttribute('aria-label'));
    for (const name of gradeNames) expect(names).toContain(`${name}, ${reason}`);
  };

  it('names the read-only version before other grading reasons', () => {
    for (const frozen of [false, true]) {
      const input = props();
      input.frozen = frozen;
      input.version!.isNewest = frozen;
      input.version!.media = { schema: 1, sources: [], placements: [], sequence: [] };
      input.edits!.busy = true;
      input.edits!.list!.stale = true;
      expectGradeReason(input, 'unavailable because v2 is read-only');
    }
  });

  it('names stale and unloaded Working edits without announcing read-only', () => {
    const input = props();
    input.edits!.list!.stale = true;
    expectGradeReason(input, 'unavailable until edits are checked against the working reel');
    expect(render(input).toString()).not.toContain('read-only');
    input.edits!.list = null;
    expectGradeReason(input, 'unavailable while edits reload');
    expect(render(input).toString()).not.toContain('read-only');
    input.edits = undefined;
    expectGradeReason(input, 'unavailable while edits reload');
  });

  it('names no picture before saving and stale edits on every affected control', () => {
    const input = props();
    input.version!.media = { schema: 1, sources: [], placements: [], sequence: [] };
    const reason = 'unavailable without a picture clip';
    expectGradeReason(input, reason);
    input.edits!.busy = true;
    input.edits!.list!.stale = true;
    expectGradeReason(input, reason);
    const controls = render(input).querySelectorAll('[aria-disabled="true"], [disabled]');
    expect(controls).toHaveLength(22);
    for (const control of controls) expect(control.getAttribute('aria-label')).toMatch(new RegExp(`, ${reason}$`));
    expect(controls.map((control) => control.getAttribute('aria-label'))).toEqual(expect.arrayContaining([`Play, ${reason}`, `Frame time, ${reason}`]));
  });

  it('names saving before stale edits on all grading controls', () => {
    const input = props();
    input.edits!.busy = true;
    expectGradeReason(input, 'unavailable while saving');
    input.edits!.list!.stale = true;
    expectGradeReason(input, 'unavailable while saving');
    input.edits!.list = null;
    expectGradeReason(input, 'unavailable while saving');
  });

  it('names why Play is unavailable for a still image', () => {
    const input = props();
    input.version!.media!.sources[0].kind = 'image';
    input.version!.media!.placements = [{ id: 'picture', role: 'main', source: 'source', in: 0, out: 0, duration: 10 }];
    const disabled = render(input).querySelectorAll('[disabled], [aria-disabled="true"]');
    expect(disabled).toHaveLength(1);
    expect(disabled[0].getAttribute('aria-label')).toBe('Play, unavailable for a still image');
    expect(disabled[0].text).toBe('Play');
  });

  it('keeps enabled grading and transport names unchanged', () => {
    const root = render(props());
    expect(root.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
    const names = root.querySelectorAll('[aria-label]').map((control) => control.getAttribute('aria-label'));
    for (const name of gradeNames.filter((name) => name !== 'Reset grade')) expect(names).toContain(name);
    expect(names).toContain('Frame time');
    for (const name of ['Play', 'Reset grade']) {
      const button = root.querySelectorAll('button').find((control) => control.text === name)!;
      expect(button.getAttribute('aria-label')).toBeUndefined();
    }
    expect(root.toString()).not.toContain('unavailable');
  });
});
