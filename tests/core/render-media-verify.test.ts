import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Page, Route } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { fixtures, invariants } from '../../web/src/review/_internal/MediaEditor.verify.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
const ROOT = '[data-verify-unit="MediaEditor"]';
const SOUND = '**/media/founder-talk/1/tone';

/** A footage-project reel whose v1 is native media: one tone, or nothing at all. */
function mediaReel(empty: boolean): string {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', join(reel, 'v1/tone.wav')], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  const media = empty
    ? { schema: 1, sources: [], placements: [], sequence: [] }
    : { schema: 1, sources: [{ id: 'tone', kind: 'audio', path: 'tone.wav', duration: 2 }], placements: [{ id: 'bed', role: 'audio', source: 'tone', at: 0, in: 0, out: 2 }], sequence: [] };
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ title: 'Verify', duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], clips: [], media }));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 2, sections: [{ id: 'all', name: 'All', start: 0, end: 2 }], shots: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><script>window.DURATION=2;window.seek=()=>{};</script>');
  return dir;
}

/** Each invariant's verdict on the live root, or on a copy changed by `tamper`, run in the page. */
function check(page: Page, tamper: Record<string, string> = {}): Promise<boolean[]> {
  return page.evaluate(([sources, selector, changes]) => {
    const live = document.querySelector(selector)!;
    const root = live.cloneNode(true) as Element;
    for (const [name, value] of Object.entries(changes)) root.setAttribute(name, value);
    return sources.map((source) => Boolean((0, eval)(`(${source})`)(root)));
  }, [invariants.map((invariant) => invariant.check.toString()), ROOT, tamper] as const);
}

/** Opens Review, routing the sound through `route` first when given. */
async function open(page: Page, url: string, route?: (route: Route) => void): Promise<void> {
  if (route) await page.route(SOUND, route);
  await page.goto(url);
  await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Founder talk: going local-first' }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator(ROOT).waitFor();
}

const status = (page: Page, name: string) => page.locator(ROOT).getAttribute(`data-verify-${name}`);

it('holds every MediaEditor invariant in each fixture state, and fails the deliberately inconsistent one (A6)', { timeout: 120_000 }, async () => {
  const verdicts: Record<string, boolean[]> = {};
  const browser = await chromium.launch();
  const servers = [];
  try {
    const filled = await startServer({ projectDir: mediaReel(false), port: 0 });
    const empty = await startServer({ projectDir: mediaReel(true), port: 0 });
    servers.push(filled, empty);

    const emptyPage = await browser.newPage();
    await open(emptyPage, empty.url);
    await expect.poll(() => status(emptyPage, 'empty')).toBe('true');
    verdicts.empty = await check(emptyPage);

    const held: Route[] = [];
    const preparing = await browser.newPage();
    await open(preparing, filled.url, (route) => void held.push(route));
    await expect.poll(() => status(preparing, 'status')).toBe('preparing');
    verdicts.preparing = await check(preparing);
    for (const route of held.splice(0)) await route.continue();

    const page = await browser.newPage();
    await open(page, filled.url);
    await expect.poll(() => status(page, 'status')).toBe('ready');
    verdicts.ready = await check(page);
    verdicts.inconsistent = await check(page, { 'data-verify-empty': 'true' });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => status(page, 'playing')).toBe('true');
    verdicts.playing = await check(page);

    const failing = await browser.newPage();
    await open(failing, filled.url, (route) => void route.abort());
    await expect.poll(() => status(failing, 'status')).toBe('error');
    verdicts.error = await check(failing);
    await failing.locator('.rv-frame').getByRole('status').filter({ hasText: 'Sound in this span could not be prepared' }).waitFor();
    await failing.getByLabel('Playhead', { exact: true }).fill('2');
    expect(await failing.locator('.editor-frame-error').count()).toBe(0);
    await failing.unroute(SOUND);
    await failing.getByRole('button', { name: 'Retry sound for bed', exact: true }).click();
    await expect.poll(() => status(failing, 'status')).toBe('ready');
    expect(await failing.getByRole('button', { name: 'Retry sound for bed', exact: true }).count()).toBe(0);
  } finally {
    await browser.close();
    for (const server of servers) await server.close();
  }

  for (const fixture of fixtures) {
    const results = verdicts[fixture.name]!;
    expect(results, fixture.name).toHaveLength(invariants.length);
    const failed = invariants.filter((_, i) => !results[i]).map((invariant) => invariant.description);
    if ('fail' in fixture && fixture.fail) expect(failed, fixture.name).toEqual(['empty matches a zero count']);
    else expect(failed, fixture.name).toEqual([]);
  }
});
