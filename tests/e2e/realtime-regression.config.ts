import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import baseline from '../../playwright.config.ts';
import { port } from './ports.ts';

/** Only servers consumed by the six realtime-engine regression suites. */
const REQUIRED_PORTS = [port('editing'), port('review'), port('snipSave')];
export default defineConfig({
  ...baseline,
  testDir: '.',
  workers: 2,
  webServer: (Array.isArray(baseline.webServer) ? baseline.webServer : []).filter((server) => REQUIRED_PORTS.some((port) => server.url === `http://localhost:${port}`)).map((server) => ({ ...server, cwd: resolve(import.meta.dirname, '../..') })),
});
