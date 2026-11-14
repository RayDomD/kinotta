import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { fixtures, invariants } from '../../web/src/review/_internal/ColourView.verify.ts';
import { openDetailedEditor } from '../helpers/review-rail.ts';
import { colourFixture } from '../web/colour-fixture.ts';

const ROOT = '[data-verify-unit="ColourView"]';

async function verdict(page: Page, tamper: Record<string, string> = {}): Promise<boolean[]> {
  return page.evaluate(([checks, attributes]) => {
    const root = document.querySelector('[data-verify-unit="ColourView"]')!.cloneNode(true) as Element;
    for (const [key, value] of Object.entries(attributes)) root.setAttribute(key, value);
    return checks.map((source) => Boolean((0, eval)(`(${source})`)(root)));
  }, [invariants.map((invariant) => invariant.check.toString()), tamper] as const);
}

it('holds ColourView invariants in every fixture and rejects the deliberate inconsistency', async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const servers = [];
  const verdicts: Record<string, boolean[]> = {};
  try {
    for (const empty of [false, true]) {
      const server = await startServer({ projectDir: colourFixture(empty), port: 0 });
      servers.push(server);
      const page = await browser.newPage();
      await openDetailedEditor(page, server.url);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Founder talk/ }).click();
      await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Colour', exact: true }).click();
      await page.locator(ROOT).waitFor();
      await expect.poll(() => page.locator(ROOT).getAttribute('data-verify-readonly')).toBe('false');
      verdicts[empty ? 'empty' : 'working'] = await verdict(page);
      if (!empty) {
        verdicts.inconsistent = await verdict(page, { 'data-verify-empty': 'true' });
        const tab = page.getByRole('tab', { name: 'Reel rail', exact: true });
        if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
        await page.locator('button[data-version="1"]').click();
        await expect.poll(() => page.locator(ROOT).getAttribute('data-verify-readonly')).toBe('true');
        verdicts.readonly = await verdict(page);
      }
      await page.close();
    }
    for (const fixture of fixtures) expect(verdicts[fixture.name].every(Boolean), fixture.description).toBe(!('fail' in fixture && fixture.fail));
  } finally {
    await browser.close();
    for (const server of servers) await server.close();
  }
}, 60_000);
