import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: '.', testMatch: 'working.spec.ts', timeout: 30_000, use: { viewport: { width: 1440, height: 1000 } } });
