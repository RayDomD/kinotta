import { reviewClockText, focusReview } from '../helpers/review-clock.ts';
import { freezeWorking, revealReelRail } from '../helpers/review-rail.ts';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Save runs the real build.
const BUILD_WAIT_MS = 30_000;
const REEL = 'founder-talk';
const SECTION = 'cold-open';
const PIN = { shot: '01', x: 0.3, y: 0.4, element: 'document' };

// The footage sample as it is (its agent-built reel has four clips), its own server (playwright.config.ts).
test.use({ baseURL: 'http://localhost:4382' });
test.describe.configure({ mode: 'serial' });

const review = (page: Page): Locator => page.getByRole('main', { name: 'Review' });

test('hand-off freezes Working, later edits continue, and cancellation keeps the journal', async ({ page }) => {
  // One comment to hand off and one edit waiting, set up through the same API the editor uses.
  const api = `/api/reels/${REEL}`;
  expect((await page.request.post(`${api}/versions/1/comments`, { data: { pin: PIN, text: 'Slide the laptops in faster.' } })).ok()).toBe(true);
  expect((await page.request.post(`${api}/edits`, { data: { kind: 'clip-trim', clip: '04', in: 9.6, out: 12 } })).status()).toBe(201);
  expect((await page.request.post(`${api}/versions/1/batch?section=${SECTION}`, { data: {} })).ok()).toBe(true);

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Founder talk/ }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
  await revealReelRail(page);
  await expect.poll(() => reviewClockText(page), { timeout: BUILD_WAIT_MS }).toMatch(/\/ 00:12\.0\d$/);
  const edits = page.getByRole('list', { name: 'Edits' });
  await expect(edits.getByRole('listitem')).toHaveCount(1);

  const note = page.getByRole('status').filter({ hasText: 'A comment batch for v2 is out' });
  await expect(note).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save|^Discard/ })).toHaveCount(0);

  // Edits still collect: a second operation is accepted while the batch is out.
  expect((await page.request.post(`${api}/edits`, { data: { kind: 'clip-slide', clip: '02', delta: 0.2 } })).status()).toBe(201);

  await expect(edits.getByRole('listitem')).toHaveCount(2);
  await note.getByRole('button', { name: 'Cancel hand-off' }).click();
  await expect(note).toHaveCount(0);
  await expect(edits.getByRole('listitem')).toHaveCount(2);
  await freezeWorking(page);
  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v3/ })).toBeVisible({ timeout: BUILD_WAIT_MS });
  await expect(page.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v3/ })).toContainText('Final render');
});
