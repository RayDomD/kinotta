import { expect, test } from '../helpers/editor-test.ts';
import { startServer } from '../../server/main.ts';
import { createStutterProject } from './realtime-project.ts';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

for (const accepted of [true, false]) test(`a split previews before its reply and ${accepted ? 'survives the save event' : 'rolls back with the server reason'}`, async ({ page }) => {
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
    await expect(editor).toHaveAttribute('data-verify-loading', 'false');
    const clips = editor.locator('[data-role="main"] button.native-clip');
    await expect(clips).toHaveCount(1);
    await page.getByLabel('Playhead', { exact: true }).fill('2');
    const before = workingReads;
    await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Split at playhead', exact: true }).click();
    await expect(clips).toHaveCount(2, { timeout: 2000 });
    expect(workingReads).toBe(before);
    send();
    await expect.poll(() => processed).toBe(true);
    // The server has saved and sent its event, but the response is still withheld.
    await page.waitForTimeout(200);
    await expect(clips).toHaveCount(2);
    expect(workingReads).toBe(before);
    reply();
    if (accepted) {
      await expect.poll(() => workingReads).toBeGreaterThan(before);
      await expect(clips).toHaveCount(2);
      await expect.poll(async () => (await clips.nth(1).getAttribute('data-placement'))?.includes('optimistic:')).toBe(false);
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
