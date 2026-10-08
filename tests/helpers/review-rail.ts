import type { Page } from 'playwright';

/** Keyboard inspection reaches covered bars without adding a point on their volume line. */
export async function inspectPlacement(page: Page, name: string | RegExp) {
  const toolbar = page.getByRole('toolbar', { name: 'Timeline tools' });
  await toolbar.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('region', { name: 'Media timeline' }).getByRole('button', { name }).first().press('Enter');
  return page.getByRole('region', { name: 'Clip settings' });
}

export async function inspectGraphic(page: Page) {
  await page.getByRole('toolbar', { name: 'Timeline tools' }).getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator('[data-graphic]').first().dblclick();
  return page.getByRole('region', { name: 'Graphics attachments' });
}

/** Drag an edge by seconds using the lane's visible time scale. */
export async function dragTimelineHandle(page: Page, label: string, seconds: number) {
  const handle = page.getByLabel(label, { exact: true });
  await handle.scrollIntoViewIfNeeded();
  const edge = (await handle.boundingBox())!;
  const coordinate = await handle.evaluate((element) => ({ width: element.closest('.native-lane-bars')!.getBoundingClientRect().width, length: Number(element.closest('[data-verify-window-length]')!.getAttribute('data-verify-window-length')) }));
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + seconds / coordinate.length * coordinate.width, edge.y + edge.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** Navigation checks explicitly reveal Reel now that Review starts with its rail collapsed. */
export async function revealReelRail(page: Page): Promise<void> {
  await page.locator('.body').waitFor();
  const reviewTab = page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review', exact: true });
  if (await reviewTab.getAttribute('aria-current') !== 'page') return;
  const tab = page.getByRole('tab', { name: 'Reel rail', exact: true });
  await tab.waitFor({ state: 'visible' });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
}
