import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startServer } from '../../server/main.ts';
import { launchAgent } from '../../server/core/_internal/runner.ts';
import { copyFixture } from '../helpers/project.ts';
import type { AgentJob } from '../../web/src/api/_internal/client.ts';

test.beforeEach(() => {
  process.env.KINOTTA_HOME = mkdtempSync(join(tmpdir(), 'agent-strip-home-'));
});

async function auto(page: Page, url: string, title: string) {
  await page.goto(url);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New reel', exact: true }).click();
  await page.getByLabel('Or use a video in this project').selectOption('media/talk.mp4');
  await page.getByLabel('Reel name', { exact: true }).fill(title);
  await page.getByRole('button', { name: /^Auto/ }).click();
}

test('Auto progress survives reel pages, Cancel preserves v1, Retry publishes and Open selects v2', async ({ page }) => {
  test.setTimeout(120_000);
  let release = () => {};
  let notifySecondLaunch = () => {};
  const secondLaunch = new Promise<void>((done) => { notifySecondLaunch = done; });
  let launchCount = 0;
  const server = await startServer({
    projectDir: copyFixture('footage-project'), port: 0,
    transcriber: async () => [{ text: 'hello', start: 0.5, end: 0.9 }, { text: 'world', start: 1, end: 1.4 }],
    agent: { quietMs: 100, launch: async (input) => {
      launchCount++;
      await new Promise<void>((done) => {
        release = done;
        if (launchCount === 2) notifySecondLaunch();
        input.signal.addEventListener('abort', () => done(), { once: true });
        if (input.signal.aborted) done();
      });
      if (input.signal.aborted) throw new Error('Cancelled');
      await launchAgent({ ...input, executable: { command: process.execPath, prefix: [resolve('tests/core/fake-broll-agent.mjs'), 'success'] } });
    } },
  });
  const slug = 'strip-test';
  try {
    await server.project.saveAgentSettings({ provider: 'claude', confirmed: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await auto(page, server.url, 'Strip test');
    const strip = page.getByRole('region', { name: 'B-roll progress' });
    await expect(strip).toContainText('Adding b-roll to Strip test');
    await expect(strip).toContainText('Claude Code is choosing and building cutaways');
    await expect(strip.getByRole('timer')).toContainText('Elapsed');
    const firstTime = await strip.getByRole('timer').innerText();
    await expect(strip.getByRole('timer')).not.toHaveText(firstTime);
    await expect(strip).toContainText('Running, no recent output');
    await expect(strip.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await expect(strip.locator('.agent-strip-track')).toBeVisible();
    const original = await server.project.readVersion(slug, 1);
    const edits = await server.project.readEditList(slug);
    mkdirSync(resolve('tests/artifacts/agent-strip'), { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `tests/artifacts/agent-strip/running-${width}.png` });
      const bounds = (await strip.boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await expect(strip.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('group', { name: 'Edit view' }).getByRole('button', { name: 'Editor', exact: true }).click();
    await page.getByRole('button', { name: /^Storyboard/ }).click();
    await expect(page.getByRole('region', { name: 'B-roll progress' })).toHaveCount(1);
    await expect(strip).toContainText('Claude Code is choosing and building cutaways');
    await expect(strip.getByRole('timer')).not.toHaveText('Elapsed 0:00');
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Library', exact: true }).click();
    await expect(strip).toBeVisible();
    const header = (await page.locator('.library-top').boundingBox())!;
    expect((await strip.boundingBox())!.y).toBeCloseTo(header.y + header.height, 0);
    await page.getByRole('button', { name: /Back/ }).click();
    await strip.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(strip).toContainText('Cancelled');
    expect(await server.project.agentJob(slug)).toMatchObject({ state: 'cancelled' });
    expect(await server.project.readVersion(slug, 1)).toEqual(original);
    expect(await server.project.readEditList(slug)).toEqual(edits);
    await strip.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(strip).toContainText('Claude Code is choosing and building cutaways');
    await secondLaunch;
    release();
    await expect(strip).toContainText('B-roll for Strip test is ready', { timeout: 60_000 });
    await strip.getByRole('button', { name: 'Open v2', exact: true }).click();
    await expect(page.locator('[data-verify-unit="VersionRail"]')).toHaveAttribute('data-verify-working', 'false');
    await expect(page.getByText('You are viewing v2, a frozen version.', { exact: true })).toBeVisible();
    await expect(strip).toHaveCount(0);
    expect((await server.project.readVersion(slug, 2)).issues).toEqual([]);
  } finally { release(); await server.close(); }
});

test('Copy mode explains the next step and exposes the request if clipboard fails', async ({ page }) => {
  const server = await startServer({ projectDir: copyFixture('footage-project'), port: 0, transcriber: async () => [{ text: 'hello', start: 0.5, end: 1 }] });
  try {
    await server.project.saveAgentSettings({ provider: 'copy' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Clipboard unavailable'); } } }));
    await auto(page, server.url, 'Copy strip');
    const strip = page.getByRole('region', { name: 'B-roll progress' });
    await expect(strip).toContainText("Paste it into your agent. Kinotta loads v2 when it's done.");
    await expect(strip.getByRole('button', { name: 'Copy request', exact: true })).toBeVisible();
    await strip.getByRole('button', { name: 'Copy request', exact: true }).click();
    await expect(strip.getByRole('textbox', { name: 'Agent request' })).toBeVisible();
    await expect(strip.getByRole('textbox', { name: 'Agent request' })).toHaveValue((await server.project.copyAgentRequest('copy-strip')).request);
  } finally { await server.close(); }
});

for (const state of ['queued', 'validating', 'cancelling', 'failed', 'interrupted', 'cancelled'] as const) {
  test(`${state} shows its stage and recovery actions`, async ({ page }) => {
    const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
    try {
      const job: AgentJob = { id: state, reel: 'product-showreel', provider: 'codex', state, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), elapsedSeconds: 3, quiet: false, canRetry: true, canCopy: true, ...(state === 'failed' || state === 'interrupted' ? { error: 'Agent could not finish' } : {}) };
      await page.route('**/api/reels/*/agent', (route) => route.fulfill({ json: { job } }));
      await page.goto(server.url);
      const strip = page.getByRole('region', { name: 'B-roll progress' });
      const label = { queued: 'Preparing the request', validating: 'Checking the result', cancelling: 'Cancelling', failed: 'Failed', interrupted: 'Failed', cancelled: 'Cancelled' }[state];
      await expect(strip).toContainText(label);
      if (['failed', 'interrupted', 'cancelled'].includes(state)) {
        await expect(strip.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
        if (state !== 'cancelled') await expect(strip).toContainText('Agent could not finish');
      }
      if (state === 'cancelled') {
        await strip.getByRole('button', { name: 'Dismiss', exact: true }).click();
        await expect(strip).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New reel', exact: true }).click();
      await expect(strip).toHaveCount(0);
    } finally { await server.close(); }
  });
}

for (const state of ['queued', 'cancelled', 'failed', 'copy-ready'] as const) {
  test(`Copy provider in ${state} state handles paste instructions and copy button`, async ({ page }) => {
    const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
    try {
      const isReady = state === 'copy-ready';
      const job: AgentJob = {
        id: `copy-${state}`,
        reel: 'product-showreel',
        provider: 'copy',
        state,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        elapsedSeconds: 3,
        quiet: false,
        canRetry: state !== 'queued',
        canCopy: isReady,
        ...(isReady ? { version: 2 } : {}),
        ...(state === 'failed' ? { error: 'Could not prepare the agent request' } : {}),
      };
      await page.route('**/api/reels/*/agent', (route) => route.fulfill({ json: { job } }));
      await page.goto(server.url);
      const strip = page.getByRole('region', { name: 'B-roll progress' });
      if (isReady) {
        await expect(strip).toContainText("Paste it into your agent. Kinotta loads v2 when it's done.");
        await expect(strip.getByRole('button', { name: 'Copy request', exact: true })).toBeVisible();
      } else {
        await expect(strip).not.toContainText('Paste it into your agent');
        await expect(strip.getByRole('button', { name: 'Copy request', exact: true })).toHaveCount(0);
      }
    } finally { await server.close(); }
  });
}
