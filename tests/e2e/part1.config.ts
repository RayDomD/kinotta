import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config.ts';
import { port } from './ports.ts';

const ports = process.env.KINOTTA_PART1_PORTS?.split(',').map(Number) ?? [port('snipSave'), port('clips'), port('codeOnly'), port('handoff'), port('transcription'), port('picker'), port('renders'), port('versions')];
export default defineConfig({ ...base, testDir: import.meta.dirname,
  testMatch: /(?:snip-save|clips|code-only|handoff|transcription|picker|renders|versions)\.spec\.ts/,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).filter((server) => ports.some((port) => server.url === `http://localhost:${port}`)).map((server) => ({ ...server, cwd: resolve(import.meta.dirname, '../..') })),
});
