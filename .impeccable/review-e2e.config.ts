import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import original from '../playwright.config.ts';

const ports = new Set([4399, 4395, 4389, 4388, 4387, 4386, 4385, 4384, 4383, 4382, 4381, 4380, 4379]);
const specs = ['smoke', 'versions', 'new-reel', 'drop-video', 'brief-reel', 'review', 'snip-save', 'clips', 'code-only', 'handoff', 'transcription', 'picker', 'renders'];
export default defineConfig({
  ...original,
  testDir: resolve('tests/e2e'),
  testMatch: specs.map((name) => `**/${name}.spec.ts`),
  outputDir: resolve('test-results/e2e-review'),
  workers: 1,
  reporter: 'line',
  webServer: (Array.isArray(original.webServer) ? original.webServer : [])
    .filter((server) => server.url && ports.has(Number(new URL(server.url).port)))
    .map((server) => ({ ...server, cwd: resolve('.') })),
});
