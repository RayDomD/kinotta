import type { Page } from 'playwright';

/** Read the displayed clock from either the retained legacy player or the native editor. */
export async function reviewClockText(page: Page): Promise<string> {
  const review = page.getByRole('main', { name: 'Review' });
  const oldClock = review.getByLabel('Playback timecode', { exact: true });
  if (await oldClock.count()) return oldClock.innerText();
  const at = Number(await review.getByLabel('Playhead', { exact: true }).inputValue());
  const duration = Number((await review.locator('.rv-tc').innerText()).match(/([\d.]+)s/)?.[1]);
  const timestamp = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  return `${timestamp(at)} / ${timestamp(duration)}`;
}

/** A preview can appear while edit commands still wait for the server reply. */
export async function waitForEditSave(page: Page): Promise<void> {
  const addTrack = page.getByRole('button', { name: 'Add track', exact: true });
  if (await addTrack.count()) await page.waitForFunction((button) => !!button?.matches(':enabled'), await addTrack.elementHandle());
}

/** Keyboard commands belong to the editor while its own control is focused. */
export async function focusReview(page: Page): Promise<void> {
  await waitForEditSave(page);
  const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
  if (await toolbar.count()) await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
  else await page.getByRole('main', { name: 'Review' }).getByRole('button', { name: 'Play', exact: true }).focus();
}
