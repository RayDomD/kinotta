import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'playback-stutter.spec.ts',
  timeout: 60_000,
  use: {
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
  },
});
