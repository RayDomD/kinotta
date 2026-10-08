import type { Page } from 'playwright';

/** Read the displayed clock from either the retained legacy player or the native editor. */
export async function reviewClockText(page: Page): Promise<string> {
  const review = page.getByRole('main', { name: 'Review' });
  const oldClock = review.getByLabel('Timecode', { exact: true });
  if (await oldClock.count()) return oldClock.innerText();
  const at = Number(await review.getByLabel('Playhead', { exact: true }).inputValue());
  const duration = Number((await review.locator('.rv-tc').innerText()).match(/([\d.]+)s/)?.[1]);
  const timestamp = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  return `${timestamp(at)} / ${timestamp(duration)}`;
}

/** Keyboard commands belong to the editor while its own control is focused. */
export async function focusReview(page: Page): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
  if (await toolbar.count()) await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
  else await page.getByRole('main', { name: 'Review' }).getByRole('button', { name: 'Play', exact: true }).focus();
}
