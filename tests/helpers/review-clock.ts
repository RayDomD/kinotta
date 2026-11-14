import type { Page, Request } from 'playwright';

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

const EDIT_SAVE_WAIT_MS = 10_000;
const editSaves = new WeakMap<Page, Set<Request>>();
const isEditSave = (request: Request) => request.method() !== 'GET' && /^\/api\/reels\/[^/]+\/edits/.test(new URL(request.url()).pathname);

/** Count edit requests in flight; the app shows no busy state while an optimistic preview saves. */
export function trackEditSaves(page: Page): void {
  const pending = new Set<Request>();
  editSaves.set(page, pending);
  page.on('request', (request) => { if (isEditSave(request)) pending.add(request); });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => pending.delete(request));
}

/** A preview can appear while edit commands still wait for the server reply. */
export async function waitForEditSave(page: Page): Promise<void> {
  const pending = editSaves.get(page);
  const deadline = Date.now() + EDIT_SAVE_WAIT_MS;
  while (pending?.size) {
    if (Date.now() > deadline) throw new Error(`${pending.size} edit save(s) still in flight after ${EDIT_SAVE_WAIT_MS} ms`);
    await page.waitForTimeout(50);
  }
  // The reply then swaps provisional placement ids for the server's.
  await page.waitForFunction(() => !document.querySelector('[data-placement*="optimistic:"]'), undefined, { timeout: EDIT_SAVE_WAIT_MS });
}

/** Keyboard commands belong to the editor while its own control is focused. */
export async function focusReview(page: Page): Promise<void> {
  await waitForEditSave(page);
  const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
  if (await toolbar.count()) await toolbar.getByRole('button', { name: 'Select', exact: true }).focus();
  else await page.getByRole('main', { name: 'Review' }).getByRole('button', { name: 'Play', exact: true }).focus();
}
