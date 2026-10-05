import { describe, expect, it } from 'vitest';
import { formatRemaining, laneProgress } from '../../web/src/review/_internal/transcribing.ts';

describe('laneProgress', () => {
  it('says how far along and how long is left while running', () => {
    expect(laneProgress({ state: 'running', duration: 100, processed: 42, remaining: 70 })).toEqual({
      failed: false,
      fraction: 0.42,
      percent: 42,
      text: 'Transcribing with faster-whisper · about 1 min left · you can cut and snip now',
    });
  });

  it('says it is starting before there is progress to estimate from', () => {
    expect(laneProgress({ state: 'running', duration: 12, processed: 0, remaining: null })?.text).toContain('starting');
  });

  it('gives the reason when it failed, and nothing once done or when none ran', () => {
    expect(laneProgress({ state: 'failed', duration: 12, processed: 3, remaining: null, error: 'ffmpeg is not installed.' })).toMatchObject({ failed: true, text: expect.stringContaining('ffmpeg is not installed.') });
    expect(laneProgress({ state: 'done', duration: 12, processed: 12, remaining: 0 })).toBeNull();
    expect(laneProgress(null)).toBeNull();
  });

  it('reads seconds under a minute and minutes above it', () => {
    expect(formatRemaining(8)).toBe('8 s');
    expect(formatRemaining(0.2)).toBe('1 s');
    expect(formatRemaining(125)).toBe('2 min');
  });
});
