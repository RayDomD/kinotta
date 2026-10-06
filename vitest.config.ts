import { defineConfig } from 'vitest/config';

/**
 * Render tests run Chromium and ffmpeg; alongside the rest they slow other process-spawning tests past their timeouts, and
 * side by side they starve each other's browsers (a screenshot fails), so they run last and one file at a time.
 */
const RENDER_TESTS = ['tests/core/render*.test.ts', 'tests/engine/render.test.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/core/**/*.test.ts', 'tests/engine/**/*.test.ts', 'tests/web/**/*.test.ts'],
          exclude: RENDER_TESTS,
          sequence: { groupOrder: 0 },
        },
      },
      { test: { name: 'render', include: RENDER_TESTS, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
});
