import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: ['simple-mode.spec.ts', 'simple-regenerate.spec.ts'], timeout: 90_000, workers: 1, use: { headless: true, viewport: { width: 1280, height: 800 } } });
