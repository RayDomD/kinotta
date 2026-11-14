import { expect, test } from '../helpers/editor-test.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assembleParts } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { partsFixture, partsInputs } from '../helpers/parts.ts';
import { invariants as storyboardInvariants } from '../../web/src/Storyboard.verify.ts';

test('stop gate: the three-shot assembled page seeks from file, plays in Review and accepts a named element pin', async ({ page }) => {
  const { dir, reelDir, manifest } = partsFixture();
  const file = join(reelDir, 'v1', 'index.html');
  writeFileSync(file, assembleParts(manifest, partsInputs(reelDir, manifest)));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => (window as any).__kinottaParts?.ready === true);
  for (const [time, name] of [[0.25, 'hook'], [1.25, 'proof'], [2.25, 'close']] as const) {
    await page.evaluate((time) => (window as any).seek(time), time);
    await expect(page.locator('[data-scene].active')).toHaveAttribute('data-scene', name);
    await expect(page.locator(`[data-scene="${name}"]`)).toHaveAttribute('data-local', '0.25');
    await expect(page.locator(`[data-scene="${name}"] [data-el="label"]`)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 5, 0)');
  }
  expect(errors).toEqual([]);

  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const preview = page.frameLocator('iframe[title="Authored graphics"]');
    await expect(preview.locator('[data-scene="proof"]')).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const pausedTime = Number(await page.getByLabel('Playhead', { exact: true }).inputValue());
    expect(pausedTime).toBeGreaterThanOrEqual(1);
    const pausedShot = manifest.shots[Math.min(Math.floor(pausedTime), manifest.shots.length - 1)].name;
    await expect(preview.locator('[data-scene].active')).toHaveAttribute('data-scene', pausedShot);
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: /^Storyboard/ }).click();
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    const dialog = page.getByRole('dialog');
    const frame = dialog.locator('.still');
    await expect(frame).toHaveAttribute('data-state', 'ready');
    await page.waitForFunction(() => document.getAnimations().length === 0);
    const bounds = (await frame.boundingBox())!;
    const element = await page.frameLocator('.sheet iframe').locator('[data-scene="proof"] [data-el="label"]').evaluate((root) => {
      const box = root.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: root.ownerDocument.defaultView!.innerWidth };
    });
    const scale = bounds.width / element.width;
    await page.mouse.click(bounds.x + element.x * scale, bounds.y + element.y * scale);
    const input = dialog.getByRole('textbox', { name: /Comment on label, shot 02/ });
    await input.fill('Hold this proof.');
    await input.press('Enter');
    await expect.poll(() => server.project.listComments('parts', 1)).toMatchObject([{ text: 'Hold this proof.', pin: { shot: '02', time: 1, element: 'label' } }]);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('assembled seek waits for an asynchronous shot before a render captures it', async ({ page }) => {
  const { reelDir, manifest } = partsFixture();
  const inputs = partsInputs(reelDir, manifest);
  inputs.shots['hook/r1'].js = `const root=document.querySelector('[data-scene="hook"]');export function seek(local){if(local===0)return;return new Promise(resolve=>{window.releasePartSeek=()=>{root.dataset.local=String(local);resolve();};});}`;
  const file = join(reelDir, 'v1', 'index.html');
  writeFileSync(file, assembleParts(manifest, inputs));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => (window as any).__kinottaParts?.ready === true);
  const result = await page.evaluate(async () => {
    const pending = (window as any).seek(0.25);
    const waits = typeof pending?.then === 'function';
    (window as any).releasePartSeek();
    await pending;
    return { waits, local: document.querySelector('[data-scene="hook"]')?.getAttribute('data-local') };
  });
  expect(result).toEqual({ waits: true, local: '0.25' });
});

test('frozen owner offsets compose with a parts animation', async ({ page }) => {
  const { dir, reelDir } = partsFixture(3, false);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await server.project.addOperation('parts', { kind: 'element-offset', clip: 'hook', element: 'label', x: 10, y: 0, scale: 1 });
    const frozen = await server.project.freezeEdits('parts');
    await page.goto(pathToFileURL(join(reelDir, `v${frozen.version}`, 'index.html')).href);
    await page.waitForFunction(() => (window as any).__kinottaParts?.ready === true);
    await page.evaluate(() => (window as any).seek(0.25));
    const label = page.locator('[data-scene="hook"] [data-el="label"]');
    await expect(label).toHaveCSS('translate', '10px');
    await expect(label).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 5, 0)');
  } finally { await server.close(); }
});

test('Storyboard stills and pins follow the Working parts sequence after a trim', async ({ page }) => {
  const { dir } = partsFixture(3, false);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await server.project.addOperation('parts', { kind: 'clip-trim', clip: 'hook', in: 0, out: 0.5 });
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.still')).toHaveAttribute('data-state', 'ready');
    const frame = page.frameLocator('.sheet iframe');
    await expect(frame.locator('[data-scene="proof"]')).toHaveAttribute('data-start', '0.5');
    await expect(frame.locator('[data-scene="proof"]')).toHaveClass(/active/);
    await expect(dialog.locator('.lbl .t')).toContainText('00.50');
    const check = async () => page.locator('[data-verify-unit="Storyboard"]').evaluate((root, checks) => checks.map((source) => new Function('return (' + source + ')')()(root)), storyboardInvariants.map((rule) => rule.check.toString()));
    expect(await check()).toEqual([true, true, true, true]);
    await page.locator('[data-verify-unit="Storyboard"]').evaluate((root) => root.setAttribute('data-verify-count', '99'));
    expect((await check())[0]).toBe(false);
  } finally { await server.close(); }
});

test('a removed named shot keeps flagged feedback without drawing it on its replacement', async ({ page }) => {
  const { dir, reelDir, manifest } = partsFixture(3, false);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await server.project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Removed proof' });
    manifest.shots.splice(1, 1);
    manifest.duration = 2;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await expect(page.locator('.comments')).toContainText('Removed proof');
    await expect(page.locator('.grid .shot').nth(1).locator('.hexpin')).toHaveCount(0);
    await page.locator('.grid').getByRole('button', { name: /^Shot 02,/ }).click();
    await expect(page.getByRole('dialog').locator('.well .hexpin')).toHaveCount(0);
    expect((await server.project.listComments('parts', 2))[0].state).toBe('moment-removed');
  } finally { await server.close(); }
});


test('seek at the reel end retains the last shot within the manifest duration tolerance', async ({ page }) => {
  const { reelDir, manifest } = partsFixture(2);
  manifest.shots[0].duration = 0.7;
  manifest.shots[1].duration = 0.1;
  manifest.duration = 0.8;
  const file = join(reelDir, 'v1', 'index.html');
  writeFileSync(file, assembleParts(manifest, partsInputs(reelDir, manifest)));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => (window as any).__kinottaParts?.ready === true);
  await page.evaluate(() => (window as any).seek(0.8));
  await expect(page.locator('[data-scene].active')).toHaveAttribute('data-scene', manifest.shots[1].name);
});
