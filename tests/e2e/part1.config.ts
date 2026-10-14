import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config.ts';

const ports = process.env.KINOTTA_PART1_PORTS?.split(',').map(Number) ?? [4385, 4384, 4383, 4382, 4381, 4380, 4379, 4395];
export default defineConfig({ ...base, testDir: import.meta.dirname,
  testMatch: /(?:snip-save|clips|code-only|handoff|transcription|picker|renders|versions)\.spec\.ts/,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).filter((server) => ports.some((port) => server.url === `http://localhost:${port}`)).map((server) => ({ ...server, cwd: resolve(import.meta.dirname, '../..') })),
});
