import { describe, expect, it } from 'vitest';
import { renderWorkers } from '../../server/core/_internal/render.ts';

const GB = 1024 ** 3;

describe('how many segments a render runs at once', () => {
  it('gives each worker its thread budget, so 16 threads run 4 workers, not 8', () => {
    expect(renderWorkers(16, 32 * GB)).toBe(4);
    expect(renderWorkers(8, 32 * GB)).toBe(2);
  });

  it('runs fewer workers when free memory is short, down to one', () => {
    expect(renderWorkers(16, 3.2 * GB)).toBe(2);
    expect(renderWorkers(16, 0.4 * GB)).toBe(1);
    expect(renderWorkers(2, 32 * GB)).toBe(1);
  });
});
