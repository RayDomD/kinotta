import { expect, test } from '../helpers/editor-test.ts';
import type { Page } from '../helpers/editor-test.ts';
import { startServer } from '../../server/main.ts';
import { createStutterProject } from './realtime-project.ts';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

for (const accepted of [true, false]) test(`a split previews before its reply and ${accepted ? 'survives the save event' : 'rolls back with the server reason'}`, async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = createStutterProject('optimistic');
  const server = await startServer({ projectDir, port: 0 });
  let send!: () => void; let reply!: () => void; let processed = false; let closing = false;
  const sendGate = new Promise<void>((resolve) => { send = resolve; });
  const replyGate = new Promise<void>((resolve) => { reply = resolve; });
  let workingReads = 0;
  try {
    page.on('request', (request) => { if (request.url().endsWith('/working')) workingReads++; });
    await page.route('**/api/reels/optimistic/edits', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      try {
        await sendGate;
        const response = accepted ? await route.fetch() : null;
        processed = true;
        await replyGate;
        if (response) await route.fulfill({ response });
        else await route.fulfill({ status: 409, json: { error: 'This source was replaced. Reload its media.' } });
      } catch (error) { if (!closing) throw error; }
    });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Playback optimistic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('[data-verify-unit="MediaEditor"]');
    await expect(editor).toHaveAttribute('data-verify-loading', 'false', { timeout: 45_000 });
    const clips = editor.locator('[data-role="main"] button.native-clip');
    await expect(clips).toHaveCount(1);
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    const before = workingReads;
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Split at playhead', exact: true }).click();
    await expect(clips).toHaveCount(2, { timeout: 5000 });
    expect(workingReads).toBe(before);
    send();
    await expect.poll(() => processed, { timeout: 15_000 }).toBe(true);
    // The server has saved and sent its event, but the response is still withheld.
    await page.waitForTimeout(200);
    await expect(clips).toHaveCount(2);
    expect(workingReads).toBe(before);
    reply();
    if (accepted) {
      await expect.poll(() => workingReads, { timeout: 15_000 }).toBeGreaterThan(before);
      await expect(clips).toHaveCount(2);
      await expect.poll(async () => (await clips.nth(1).getAttribute('data-placement'))?.includes('optimistic:'), { timeout: 15_000 }).toBe(false);
    } else {
      await expect(clips).toHaveCount(1);
      await expect(editor.getByRole('alert').filter({ hasText: 'This source was replaced. Reload its media.' })).toBeVisible();
    }
  } finally {
    closing = true; send(); reply(); await page.close(); await server.close();
    try { rmSync(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (error) { if (!['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  }
});

test('Simple mode shows a word edit before the reply and restores it on refusal', async ({ browser }) => {
  const projectDir = createStutterProject('simple-optimistic');
  for (const file of ['plan.json', 'v1/plan.json', 'v1/media.json']) {
    const path = join(projectDir, 'reels/simple-optimistic', file);
    const plan = JSON.parse(readFileSync(path, 'utf8'));
    plan.captions = true;
    plan.media.sources[0].words = [{ text: 'hello', start: 0.5, end: 1 }];
    plan.media.placements[0].speech = true;
    writeFileSync(path, JSON.stringify(plan));
  }
  const server = await startServer({ projectDir, port: 0 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let release!: () => void; let closing = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    await page.route('**/api/reels/simple-optimistic/edits', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await gate;
      if (!closing) await route.fulfill({ status: 409, json: { error: 'The word changed in another edit.' } });
    });
    await page.goto(server.url);
    await page.getByRole('button', { name: /^Open caption at/ }).first().click();
    await page.getByRole('button', { name: /^Edit word/ }).first().click();
    await page.getByLabel(/^Word at/).fill('welcome');
    await page.keyboard.press('Enter');
    const word = page.locator('.editorial-word').first();
    await expect(word).toContainText('welcome', { timeout: 2000 });
    release();
    await expect(word).toContainText('hello');
    await expect(page.getByRole('main', { name: 'Review' }).getByRole('alert').filter({ hasText: 'The word changed in another edit.' })).toBeVisible();
  } finally {
    closing = true; release(); await page.close(); await server.close();
    try { rmSync(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (error) { if (!['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  }
});

test('the editor preview draws captions in the plan\'s font and background, and as built without them', async ({ browser }) => {
  const projectDir = createStutterProject('caption-style');
  const planFiles = ['plan.json', 'v1/plan.json', 'v1/media.json'].map((file) => join(projectDir, 'reels/caption-style', file));
  const setCaptions = (captions: unknown): void => {
    for (const path of planFiles) {
      const plan = JSON.parse(readFileSync(path, 'utf8'));
      plan.captions = captions;
      plan.media.sources[0].words = [{ text: 'hello', start: 0.5, end: 1 }];
      plan.media.placements[0].speech = true;
      writeFileSync(path, JSON.stringify(plan));
    }
  };
  const caption = (page: Page) => page.frameLocator('iframe[title="Authored graphics"]').locator('.caption').first();
  const vars = (page: Page) => caption(page).evaluate((el) => ({ font: (el as HTMLElement).style.getPropertyValue('--cap-font'), background: (el as HTMLElement).style.getPropertyValue('--cap-bg') }));
  const open = async (page: Page, url: string): Promise<void> => {
    await page.goto(url);
    await expect(caption(page)).toBeAttached();
  };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    setCaptions({ font: { family: 'Geist', weight: 800, size: 64 }, background: 'rgba(0, 0, 0, 0.4)' });
    server = await startServer({ projectDir, port: 0 });
    await open(page, server.url);
    await expect.poll(() => vars(page)).toEqual({ font: "800 64px/1.18 'Geist',system-ui,sans-serif", background: 'rgba(0, 0, 0, 0.4)' });
    await server.close();

    // Captions without the fields leave the page's own font and background in force.
    setCaptions(true);
    server = await startServer({ projectDir, port: 0 });
    await open(page, server.url);
    await expect.poll(() => vars(page)).toEqual({ font: '', background: '' });
  } finally {
    await page.close(); await server?.close();
    try { rmSync(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (error) { if (!['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  }
});
