import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewClockText } from '../helpers/review-clock.ts';
import { revealReelRail } from '../helpers/review-rail.ts';
import { expect, test } from '../helpers/editor-test.ts';
import type { Locator, Page } from '../helpers/editor-test.ts';
import { projectFile, serverUrl } from './ports.ts';

const REEL = 'founder-talk';
const API = `/api/reels/${REEL}`;
/** Waiting for the server to see the agent's new version and replay the edits onto it. */
const REPLAY_WAIT_MS = 15_000;
const PIN = { shot: '01', x: 0.3, y: 0.4, element: 'document' };

// The footage sample as it is, its own server (playwright.config.ts): this spec changes the project's plan.
test.use({ baseURL: serverUrl('staleEdit') });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });

test('a refused save names the stale edit, and clicking it opens its row and moves the playhead', async ({ page }) => {
  // An edit made on v1: it trims clip 04, the last shot.
  expect((await page.request.post(`${API}/edits`, { data: { kind: 'clip-trim', clip: '04', in: 9.6, out: 12 } })).status()).toBe(201);

  // The agent builds v2 from a plan without that clip, as in the handoff core test: a copy of v1 beside a changed plan.
  const project = readFileSync(projectFile('stale-edit'), 'utf8').trim();
  cpSync(join(project, 'reels', REEL, 'v1'), join(project, 'reels', REEL, 'v2'), { recursive: true });
  const planFile = join(project, 'motion', 'plan.json');
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  plan.clips = plan.clips.filter((clip: { id: string }) => clip.id !== '04');
  writeFileSync(planFile, JSON.stringify(plan));
  await expect.poll(async () => {
    const list = await (await page.request.get(`${API}/edits`)).json();
    return list.base === 2 && Object.keys(list.flagged ?? {}).length === 1 && Object.keys(list.flaggedAt ?? {}).length === 1;
  }, { timeout: REPLAY_WAIT_MS }).toBe(true);
  const list = await (await page.request.get(`${API}/edits`)).json();
  const [id] = Object.keys(list.flagged);
  const at = list.flaggedAt[id] as { time: number; shot?: string };
  expect(at.time).toBeGreaterThan(1);
  expect(at.shot).toBeTruthy();

  // A comment on v2 gives the Copy button something to save, and saving is refused.
  expect((await page.request.post(`${API}/versions/2/comments`, { data: { pin: PIN, text: 'Slide the laptops in faster.' } })).ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Founder talk/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await revealReelRail(page);
  await expect.poll(() => reviewClockText(page), { timeout: REPLAY_WAIT_MS }).toMatch(/^00:00\.00 \//);
  await page.getByRole('button', { name: /^Copy section 01 comments/ }).click();

  const entry = page.locator('.copy-error').getByRole('button', { name: new RegExp(`\\(shot ${at.shot}\\)$`) });
  await expect(page.locator('.copy-error')).toContainText('One edit no longer applies to v2');
  await expect(entry).toBeVisible();

  // Clicking the entry opens the Edits panel on that edit's row, focused and marked, and the playhead is where the edit acts.
  await entry.click();
  await expect(page.getByRole('tab', { name: 'Edits' })).toHaveAttribute('aria-selected', 'true');
  const row = page.getByRole('list', { name: 'Edits' }).locator(`[data-edit-id="${id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toBeFocused();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(row.locator('.note')).toContainText('No longer applies to v2');
  await expect.poll(async () => Number(await review(page).getByLabel('Playhead', { exact: true }).inputValue())).toBeCloseTo(at.time, 1);
});
