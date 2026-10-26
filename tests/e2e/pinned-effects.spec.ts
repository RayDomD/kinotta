import { expect, test, type Locator, type Page } from '../helpers/editor-test.ts';
import { startServer } from '../../server/main.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { alternatesFixture } from '../helpers/parts.ts';

async function drop(page: Page, effect: string, card: Locator) {
  const source = page.locator(`[data-effect="${effect}"]`);
  await source.scrollIntoViewIfNeeded();
  await source.dragTo(card.locator('.open'), { targetPosition: effect === 'title-card' ? { x: 100, y: 50 } : { x: 170, y: 80 } });
}

test('frame drops make instant Working output, queue speech effects, route notes, and support Delete and Undo', async ({ page }) => {
  const { dir } = alternatesFixture();
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    const card = page.locator('.shot').first();
    await expect(page.locator('[data-effect="title-card"]')).toHaveCount(1);
    await drop(page, 'title-card', card);
    await expect(page.locator('.fx-pin-card')).toHaveCount(1);
    await expect(page.locator('.fx-pin-card')).toContainText('Instant · free');
    await expect.poll(async () => (await server.project.readEditList('parts')).operations.length).toBe(1);
    expect(await server.project.agentJob('parts')).toBeNull();
    // Inspect actual template output and seek it, rather than treating a pin badge as generated content.
    const frame = card.frameLocator('iframe.still-frame');
    await expect(frame.locator('iframe[data-pinned-effect]')).toHaveCount(1);
    await card.locator('iframe.still-frame').evaluate(async (node) => { await ((node as HTMLIFrameElement).contentWindow as Window & { seek(t: number): Promise<void> }).seek(.6); });
    await expect(frame.frameLocator('iframe[data-pinned-effect]').getByRole('heading', { name: 'Parts fixture' })).toBeVisible();
    await page.getByRole('group', { name: 'Current reel history' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(0);
    await page.getByRole('group', { name: 'Current reel history' }).getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(1);
    const note = page.getByRole('textbox', { name: 'Note for Title card 1' });
    await note.fill('Keep it small'); await note.blur();
    await expect(page.locator('.fx-pin-card')).toContainText('Needs the agent');
    await expect.poll(async () => (await server.project.listComments('parts', 1))[0].instant).toBeUndefined();
    expect((await server.project.readEditList('parts')).operations).toHaveLength(0);
    await note.fill(''); await note.blur();
    await expect.poll(async () => (await server.project.listComments('parts', 1))[0].instant).toBe(true);
    await drop(page, 'big-word', card);
    await expect(page.locator('.fx-pin-card')).toHaveCount(2);
    expect((await server.project.readEditList('parts')).operations).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Build next version, 1 waiting, 1 agent run' })).toBeEnabled();
    await page.getByRole('button', { name: 'Select pin 2' }).click();
    await page.keyboard.press('Delete');
    await expect(page.locator('.fx-pin-card')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.fx-pin-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Delete pin 2' }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(1);
    await page.locator('.comments').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(2);
    expect((await server.project.readEditList('parts')).operations).toHaveLength(1);
    await page.getByRole('button', { name: 'Delete pin 1' }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(1);
    await page.locator('.comments').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(2);
    await expect(page.locator('.shot').nth(2).frameLocator('iframe.still-frame').locator('[data-scene="close"]')).toHaveCSS('visibility', 'visible');
    await page.screenshot({ path: join(tmpdir(), 'kinotta-pins-desktop.png'), fullPage: true });
  } finally { await server.close(); }
});

test('only frames accept drops; the shown alternate owns its pin and Insert shot goes in the next batch', async ({ page }) => {
  const { dir } = alternatesFixture(); const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts'); await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    const source = page.locator('[data-effect="title-card"]');
    const card = page.locator('.shot').nth(1);
    await source.scrollIntoViewIfNeeded(); await source.dragTo(page.locator('.fx-gap').first());
    expect(await server.project.listComments('parts', 1)).toHaveLength(0);
    await source.dragTo(card.locator('.shot-alternates'));
    expect(await server.project.listComments('parts', 1)).toHaveLength(0);
    await card.getByRole('button', { name: 'Show alternate B', exact: true }).click();
    await drop(page, 'title-card', card);
    await expect(page.locator('.fx-pin-card')).toHaveCount(1);
    await expect(card.locator('.shot-alternates')).toContainText('previewing B');
    await expect(card.locator('.shot-alternates')).toContainText('A in the reel');
    expect((await server.project.listComments('parts', 1))[0].pin).toMatchObject({ alternate: 'r2', shot: '02' });
    expect((await server.project.readWorkingVersion('parts')).workingParts?.shots[1].revision).toBe('r1');
    await page.getByRole('button', { name: 'Insert shot after Shot 01', exact: true }).click();
    await page.getByRole('textbox', { name: 'Describe the new shot', exact: true }).fill('Show the cup beside the window');
    await page.getByRole('button', { name: 'Add to next Build', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Build next version, 1 waiting, 1 agent run' })).toBeEnabled();
    // Build uses the existing batch hand-off; clipboard availability does not affect the saved batch.
    await page.getByRole('button', { name: 'Build next version, 1 waiting, 1 agent run' }).click();
    await expect.poll(async () => (await server.project.readEditList('parts')).handedOff?.version).toBeGreaterThan(1);
    const frozen = (await server.project.readEditList('parts')).frozen!;
    const batch = JSON.parse(await readFile(join(dir, 'reels/parts', `v${frozen}`, 'comments.json'), 'utf8'));
    expect(batch.comments).toEqual([expect.objectContaining({ insertShot: true, text: 'Show the cup beside the window' })]);
    await server.project.buildParts('parts', 'Test agent');
    expect(await server.project.builtPinNotes('parts')).toEqual([]);
    await expect(page.getByRole('heading', { name: "Keep this note in this reel's style?" })).toHaveCount(0);
  } finally { await server.close(); }
});

test('phone pins and cards can be deleted and undone, while adding effects is unavailable', async ({ page }) => {
  const { dir } = alternatesFixture(); const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts');
    await server.project.addComment('parts', 1, { pin: { shot: '01', x: .5, y: .5, element: null }, effect: 'title-card', text: '' });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Select pin 1' })).toBeVisible();
    await expect(page.locator('.fx-pin-card')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Effects to pin' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Insert shot after Shot 01', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Delete pin 1' }).click();
    await expect(page.locator('.fx-pin-card')).toHaveCount(0);
    await page.locator('.comments').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('.fx-pin-card')).toBeVisible();
    await page.getByRole('button', { name: 'Select pin 1' }).click(); await page.keyboard.press('Delete');
    await expect(page.locator('.fx-pin-card')).toHaveCount(0);
    await page.locator('.comments').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Select pin 1' })).toBeVisible();
    await page.screenshot({ path: join(tmpdir(), 'kinotta-pins-phone.png'), fullPage: true });
  } finally { await server.close(); }
});

test('built note prompt quotes the note and keeps it only in this reel style', async ({ page }) => {
  const { dir } = alternatesFixture(); const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.buildParts('parts'); await server.project.copyStyleToReel('parts', { id: 'clean' });
    await server.project.addComment('parts', 1, { pin: { shot: '01', x: .5, y: .5, element: null }, effect: 'title-card', text: 'Keep captions low, under my chin' });
    await server.project.copyBatch('parts', 1); await server.project.buildParts('parts', 'Test agent');
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Parts fixture', exact: true }).click();
    const prompt = page.getByRole('region', { name: 'Keep this note', exact: true });
    await expect(prompt.getByRole('heading')).toHaveText("Keep this note in this reel's style?");
    await expect(prompt.locator('blockquote')).toHaveText('Keep captions low, under my chin');
    await expect(prompt).toContainText('Kinotta will follow it on later versions of this reel. To use it on other reels, reuse this style or save it as yours. You can see or turn off rules in the Check step.');
    await expect(prompt.getByRole('button', { name: 'Only this version', exact: true })).toBeVisible();
    await prompt.getByRole('button', { name: 'Always for this reel', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect((await server.project.readReelStyle('parts'))?.rules).toEqual(['Keep captions low, under my chin']);
    expect((await server.project.listStyles()).styles.find((style) => style.id === 'clean')?.rules).toEqual([]);
    await page.reload(); await expect(prompt).toHaveCount(0);
  } finally { await server.close(); }
});
