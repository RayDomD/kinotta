import type { Page } from 'playwright';

/** Render-unit checks open the same detailed surface they exercised before Simple became the default. */
export async function openDetailedEditor(page: Page, url: string): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('kinotta-mode', 'editor'); } catch { /* Non-origin fixture page. */ } });
  await page.goto(url);
}

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
  const word = /^Word (?:start|end) at ([\d.]+) in /.exec(label);
  if (word) await openCaption(page, word[1]!);
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
  const reviewTab = page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true });
  if (await reviewTab.getAttribute('aria-current') !== 'page') return;
  const tab = page.getByRole('tab', { name: 'Reel rail', exact: true });
  await tab.waitFor({ state: 'visible' });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
}

/** Word tools are inside the caption the owner explicitly opens. */
export async function openCaption(page: Page, time: string): Promise<void> {
  const button = page.getByRole('button', { name: `Open caption at ${time}`, exact: true });
  const words = page.locator(`[data-caption][data-start="${Number(time)}"] [data-word]`).first();
  await button.or(words).first().waitFor();
  if (await button.count()) await button.click();
}

/** Final is the editor's freeze boundary. These editing checks cancel its render after capture. */
export async function freezeWorking(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Render Working', exact: true });
  if (!await dialog.count()) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'More settings…', exact: true }).click();
  }
  await dialog.getByRole('radio', { name: /^Final, freezes/ }).check();
  await dialog.getByRole('combobox', { name: 'Size', exact: true }).selectOption('half');
  const response = page.waitForResponse((reply) => reply.url().endsWith('/working-render') && reply.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  const result = await response;
  if (result.ok()) {
    const job = await result.json() as { id: string };
    // Cancellation is idempotent; retry one reset cleanup connection.
    await page.request.delete(`/api/renders/${job.id}`, { maxRetries: 1 });
    await page.keyboard.press('Escape');
  }
}

/** Serial fixture scenarios undo prior live edits now that a freeze retains the journal. */
export async function undoWorkingEdits(page: Page, slug: string): Promise<void> {
  const url = `/api/reels/${slug}/edits`;
  let list = await (await page.request.get(url)).json() as { operations: unknown[]; canUndo: boolean };
  while (list.operations.length) {
    if (!list.canUndo) throw new Error('Fixture Working history cannot be undone.');
    const response = await page.request.post(`${url}/undo`);
    if (!response.ok()) throw new Error(await response.text());
    list = await response.json();
  }
}
