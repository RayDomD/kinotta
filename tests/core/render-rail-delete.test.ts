import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { invariants } from '../../web/src/App.verify.ts';
import { partsFixture } from '../helpers/parts.ts';
import { openDetailedEditor } from '../helpers/review-rail.ts';

it('folds the rail, deletes a version and a closed reel, cancels with Escape and displays the Current base refusal', { timeout: 90_000 }, async () => {
  const { dir, reelDir } = partsFixture();
  for (const number of [2, 3]) cpSync(join(reelDir, 'v1'), join(reelDir, `v${number}`), { recursive: true });
  const closedReel = join(dir, 'reels', 'closed');
  cpSync(reelDir, closedReel, { recursive: true });
  writeFileSync(join(closedReel, 'reel.json'), JSON.stringify({ title: 'Closed fixture' }));
  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1272, height: 950 } });
    const deletes: string[] = [];
    page.on('request', (request) => { if (request.method() === 'DELETE') deletes.push(request.url()); });
    await openDetailedEditor(page, server.url, { foldedRail: true });
    const reelsFold = page.locator('[data-rail-fold="reels"]');
    const versionsFold = page.locator('[data-rail-fold="versions"]');
    const reels = page.getByRole('navigation', { name: 'Reels', exact: true });
    const versions = page.getByRole('navigation', { name: 'Versions', exact: true });
    await reelsFold.waitFor();
    expect(await reelsFold.getAttribute('aria-expanded')).toBe('false');
    expect(await reelsFold.textContent()).toContain('2 reels');
    expect(await reels.isVisible()).toBe(false);
    await reelsFold.click();
    await reels.getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await versionsFold.waitFor();
    expect(await versionsFold.getAttribute('aria-expanded')).toBe('false');
    expect(await versions.isVisible()).toBe(false);
    expect(await versionsFold.locator('[title]').getAttribute('title')).toContain('v1 to v3');
    expect(await reels.getByRole('button', { name: 'Delete reel Parts fixture', exact: true }).count()).toBe(0);
    await versionsFold.click();
    expect(await versions.isVisible()).toBe(true);
    await versionsFold.click();
    expect(await versions.isVisible()).toBe(false);
    await versionsFold.click();

    // Reload proves each section remembers its own state in the project.
    await page.reload();
    await reelsFold.waitFor();
    expect(await reelsFold.getAttribute('aria-expanded')).toBe('true');
    await reels.getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await versionsFold.waitFor();
    expect(await versionsFold.getAttribute('aria-expanded')).toBe('true');
    const rail = page.locator('[data-verify-unit="VersionRail"]');
    await expect.poll(() => rail.getAttribute('data-verify-count')).toBe('3');
    const verdicts = await rail.evaluate((root, checks) => checks.map((check) => Boolean((0, eval)(`(${check})`)(root))), invariants.map((rule) => rule.check.toString()));
    expect(verdicts).toEqual(invariants.map(() => true));
    const invalidCount = await rail.evaluate((root, checks) => {
      const copy = root.cloneNode(true) as Element;
      copy.setAttribute('data-verify-count', '99');
      return checks.map((check) => Boolean((0, eval)(`(${check})`)(copy)));
    }, invariants.map((rule) => rule.check.toString()));
    expect(invalidCount.filter((pass) => !pass)).toHaveLength(1);
    const workingBefore = await (await page.request.get(`${server.url}/api/reels/parts/working`)).text();

    // Tab from the version row reaches Delete without a pointer hover.
    await versions.locator('[data-version="2"]').focus();
    await page.keyboard.press('Tab');
    const removeVersion = versions.getByRole('button', { name: 'Delete v2', exact: true });
    expect(await removeVersion.evaluate((node) => node === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');
    let sheet = page.getByRole('dialog', { name: 'Delete v2?', exact: true });
    await sheet.waitFor();
    expect(await sheet.textContent()).toContain('Working never changes.');
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Delete v2');
    expect(deletes).toHaveLength(0);
    expect(existsSync(join(reelDir, 'v2'))).toBe(true);
    await removeVersion.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(deletes).toHaveLength(0);
    await removeVersion.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete version', exact: true }).click();
    await expect.poll(() => versions.locator('[data-version="2"]').count()).toBe(0);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    await expect.poll(() => versionsFold.evaluate((node) => node === document.activeElement)).toBe(true);
    expect(await rail.getAttribute('data-verify-working')).toBe('true');
    expect(await (await page.request.get(`${server.url}/api/reels/parts/working`)).text()).toBe(workingBefore);

    // A refusal must display the actual route reason and keep the folder intact.
    const baseBefore = readFileSync(join(reelDir, 'v3', 'shots.json'), 'utf8');
    await versions.locator('[data-version="3"]').focus();
    await versions.getByRole('button', { name: 'Delete v3', exact: true }).click();
    sheet = page.getByRole('dialog', { name: 'Delete v3?', exact: true });
    const refused = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/versions/3'));
    await sheet.getByRole('button', { name: 'Delete version', exact: true }).click();
    const response = await refused;
    expect(response.status()).toBe(409);
    const reason = (await response.json() as { error: string }).error;
    expect(reason).toContain('Current');
    await expect.poll(() => sheet.getByRole('alert').textContent()).toBe(reason);
    expect(readFileSync(join(reelDir, 'v3', 'shots.json'), 'utf8')).toBe(baseBefore);
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });

    await reels.getByRole('button', { name: 'Closed fixture', exact: true }).focus();
    await reels.getByRole('button', { name: 'Delete reel Closed fixture', exact: true }).click();
    sheet = page.getByRole('dialog', { name: 'Delete reel "Closed fixture"?', exact: true });
    expect(await sheet.textContent()).toContain('Your footage stays');
    await sheet.getByRole('button', { name: 'Delete reel', exact: true }).click();
    await expect.poll(() => reels.getByRole('button', { name: 'Closed fixture', exact: true }).count()).toBe(0);
    expect(existsSync(closedReel)).toBe(false);
    expect(existsSync(reelDir)).toBe(true);
    await expect.poll(() => reelsFold.evaluate((node) => node === document.activeElement)).toBe(true);
    expect(deletes).toHaveLength(3);
  } finally { await browser.close(); await server.close(); }
});
