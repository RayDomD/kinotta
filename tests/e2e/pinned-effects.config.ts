import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'pinned-effects.spec.ts', timeout: 45_000, use: { viewport: { width: 1440, height: 1000 } } });
