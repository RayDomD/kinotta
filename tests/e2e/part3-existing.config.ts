import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config.ts';
import { port } from './ports.ts';

const ports = [port('shared'), port('pins'), port('review'), port('editing')];
export default defineConfig({ ...base, testDir: import.meta.dirname,
  testMatch: /(?:storyboard|pins|review|editing)\.spec\.ts/,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).filter((server) => ports.some((port) => server.url === `http://localhost:${port}`)).map((server) => ({ ...server, cwd: resolve(import.meta.dirname, '../..') })),
});
