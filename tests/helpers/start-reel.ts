import type { Page } from '@playwright/test';
import { revealReelRail } from './review-rail.ts';

/**
 * Starts a plain reel from a project video through the API (no style, no dead-air cuts, no agent), then opens it in
 * the editor's Review. For specs about editing a reel; the start screen itself is covered by new-reel and drop-video.
 */
export async function startReelInEditor(page: Page, title: string, video = 'media/talk.mp4'): Promise<void> {
  const response = await page.request.post('/api/reels', { data: { video, title } });
  if (!response.ok()) throw new Error(`Could not start ${title}: ${await response.text()}`);
  await page.goto('/');
  await revealReelRail(page);
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
}
