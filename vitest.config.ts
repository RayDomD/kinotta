import { defineConfig } from 'vitest/config';

/**
 * Render tests run Chromium and ffmpeg; alongside the rest they slow other process-spawning tests past their timeouts, and
 * side by side they starve each other's browsers (a screenshot fails), so they run last and one file at a time.
 */
const RENDER_TESTS = ['tests/core/render*.test.ts', 'tests/engine/render.test.ts'];

// Eleven load-sensitive tests across these six files passed unchanged in isolation.
const PROCESS_HEAVY_TESTS = [
  'tests/core/code-media-save.test.ts', 'tests/core/handoff.test.ts',
  'tests/core/legacy-media-editing.test.ts', 'tests/core/parts-batch.test.ts',
  'tests/core/section-batches.test.ts', 'tests/core/version-media.test.ts',
  // Also reproduced at 5 s in the requested full-run verification.
  'tests/core/alternates-build.test.ts', 'tests/core/alternates-comments.test.ts',
  'tests/core/working-reversals.test.ts',
  // New fake-agent suites also run child processes and Chromium.
  'tests/core/agent-jobs.test.ts', 'tests/core/agent-http.test.ts',
];
const PROCESS_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // These suites also spawn scripts and browsers; bound their process fan-out.
          maxWorkers: 2,
          include: ['tests/core/**/*.test.ts', 'tests/engine/**/*.test.ts', 'tests/web/**/*.test.ts'],
          exclude: [...RENDER_TESTS, ...PROCESS_HEAVY_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      { test: { name: 'process-heavy', include: PROCESS_HEAVY_TESTS, fileParallelism: false, testTimeout: PROCESS_TEST_TIMEOUT_MS, sequence: { groupOrder: 1 } } },
      { test: { name: 'render', include: RENDER_TESTS, fileParallelism: false, sequence: { groupOrder: 2 } } },
    ],
  },
});
