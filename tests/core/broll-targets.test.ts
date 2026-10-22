import { describe, expect, it } from 'vitest';
import { brollTargets } from '../../server/core/model.ts';

describe('b-roll product targets', () => {
  it('uses the selected coverage and visual pace for the preview and request', () => {
    expect(brollTargets('heavy', 'fast', 60)).toEqual({ coveragePercent: 60, shotSeconds: 1.4, count: 26 });
    expect(brollTargets('light', 'calm', 55)).toEqual({ coveragePercent: 20, shotSeconds: 5.5, count: 2 });
    expect(brollTargets('medium', 'normal', 60)).toEqual({ coveragePercent: 40, shotSeconds: 3, count: 8 });
  });
  it.each([0, -1, NaN, Infinity])('has no cutaways for invalid or empty duration %s', (duration) => {
    expect(brollTargets('medium', 'normal', duration).count).toBe(0);
  });
});
