import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config.ts';

const ports = [4399, 4398, 4386, 4379];
export default defineConfig({ ...base, testDir: import.meta.dirname,
  testMatch: /(?:storyboard|pins|review|renders)\.spec\.ts/,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).filter((server) => ports.some((port) => server.url === `http://localhost:${port}`)).map((server) => ({ ...server, cwd: resolve(import.meta.dirname, '../..') })),
});
