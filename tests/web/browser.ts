import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Real React hooks and media elements, without using an owner's API server. */
export async function browserHarness() {
  const cacheDir = await mkdtemp(join(tmpdir(), 'kinotta-web-tests-'));
  const server = await createServer({ configFile: false, root: process.cwd(), cacheDir, plugins: [react()],
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('../..')] } } });
  await server.listen();
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls!.local[0]}tests/web/harness.html`);
  await page.waitForFunction(() => !!(window as any).mountPicture);
  return { page, close: async () => { await browser.close(); await server.close(); await rm(cacheDir, { recursive: true, force: true }); } };
}
