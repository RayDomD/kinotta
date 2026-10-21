import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { launchAgent } from '../../server/core/_internal/runner.ts';
import { copyFixture } from '../helpers/project.ts';

it('Make in Simple plays v1 while a fake agent runs, then loads published v2 as Working', { timeout: 90_000 }, async () => {
  let release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  const server = await startServer({
    projectDir: copyFixture('footage-project'), port: 0,
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 0.9 }, { text: 'world', start: 1, end: 1.4 }],
    agent: { launch: async (input) => { await gate; await launchAgent({ ...input, executable: { command: process.execPath, prefix: [resolve('tests/core/fake-broll-agent.mjs'), 'success'] } }); } },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    await server.project.saveAgentSettings({ provider: 'claude' });
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('kinotta-simple-profile-v1', JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' })));
    await page.goto(server.url);
    await page.getByRole('button', { name: 'New reel', exact: true }).click();
    await page.getByLabel('Or use a video in this project').selectOption('media/talk.mp4');
    await page.getByLabel('Reel name', { exact: true }).fill('Fake agent Make');
    await page.getByRole('button', { name: 'Make', exact: true }).click();
    const slug = 'fake-agent-make';
    await expect.poll(() => server.project.agentJob(slug).then((job) => job?.state).catch(() => undefined), { timeout: 20_000 }).toBe('running');
    expect((await server.project.readWorkingVersion(slug)).number).toBe(1);
    const clock = page.locator('[data-verify-unit="MediaEditor"]');
    await expect.poll(() => clock.getAttribute('data-verify-status'), { timeout: 20_000 }).toBe('ready');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => Number(await clock.getAttribute('data-verify-clock'))).toBeGreaterThan(0.2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    release(); await server.project.whenAgentDone(slug);
    expect(await server.project.agentJob(slug)).toMatchObject({ state: 'succeeded', version: 2 });
    await expect.poll(async () => {
      const frames = await page.locator('.rv-page iframe').evaluateAll((frames) => frames.map((frame) => (frame as HTMLIFrameElement).src));
      return frames.some((src) => src.includes('/v2/'));
    }, { timeout: 20_000 }).toBe(true);
    expect((await server.project.readWorkingVersion(slug)).number).toBe(2);
  } finally { release(); await browser.close(); await server.close(); }
});
