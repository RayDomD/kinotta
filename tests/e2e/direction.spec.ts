import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startServer } from '../../server/main.ts';
import { agentTold } from '../../server/core/_internal/direction.ts';
import { copyFixture } from '../helpers/project.ts';

const WORDS = [{ text: 'Hello', start: 0.5, end: 0.9 }];

async function serve() {
  // Saved styles for you live in the home folder; each test gets its own.
  process.env.KINOTTA_HOME = mkdtempSync(join(tmpdir(), 'kinotta-home-'));
  const dir = copyFixture('footage-project');
  const server = await startServer({ projectDir: dir, port: 0, transcriber: async () => WORDS });
  await server.project.saveAgentSettings({ provider: 'copy' });
  return Object.assign(server, { dir });
}

async function openDirection(page: Page, url: string, title: string) {
  await page.goto(url);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'New reel', exact: true }).click();
  await page.getByLabel('Or use a video in this project').selectOption('media/talk.mp4');
  await page.getByLabel('Reel name', { exact: true }).fill(title);
  await page.getByRole('group', { name: 'How to make it' }).getByRole('button', { name: /^Direct/ }).click();
  return page.getByRole('main', { name: 'Direction' });
}

test('Direct at desktop width: every step, Change, Save as my style and Build send the style the Check step showed', async ({ page }) => {
  const server = await serve();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const direction = await openDirection(page, server.url, 'Directed');
    const steps = direction.getByRole('list', { name: 'Direction steps' });
    const soFar = direction.getByLabel('So far');

    // 1 What: the form, what it is about, and the frame found in the video.
    await direction.getByRole('radio', { name: /^Vlog/ }).click();
    await expect(soFar.getByRole('button', { name: 'Vlog' })).toHaveClass(/mine/);
    await direction.getByRole('textbox', { name: /What.s it about/ }).fill('A weekend hike');
    await expect(direction.getByText('Found in your video (640 × 360).')).toBeVisible();
    await direction.getByRole('button', { name: /^Next: style/ }).click();

    // 2 Style: a built-in card, and a changed setting marked "yours".
    await expect(steps.getByRole('button', { name: /Style/ })).toHaveAttribute('aria-current', 'step');
    await direction.getByRole('radio', { name: /^Creator/ }).click();
    await direction.getByText('Fine-tune the details').click();
    await direction.getByRole('group', { name: 'Pace' }).getByRole('button', { name: 'Calm' }).click();
    await expect(direction.getByText('· yours')).toBeVisible();
    await expect(direction.getByText('1 changed by you')).toBeVisible();
    await direction.getByRole('button', { name: /^Next: fonts/ }).click();

    // 3 Fonts and music: the brand's (here the built-in brand's) are preselected.
    await expect(direction.getByRole('radio', { name: /Kinotta's fonts/ })).toHaveAttribute('aria-checked', 'true');
    await expect(direction.getByText('Geist for words, Geist Mono for numbers.')).toBeVisible();
    await direction.getByRole('radio', { name: /Fraunces/ }).click();
    await direction.getByRole('radio', { name: /No music/ }).click();
    await direction.getByRole('button', { name: /^Next: extras/ }).click();

    // 4 Extras: effects as plain ids, and shots wanted.
    await direction.getByRole('textbox', { name: 'Effect id' }).fill('checklist');
    await direction.getByRole('button', { name: '+ Add' }).click();
    await expect(direction.getByRole('list', { name: 'Effects to try' })).toContainText('checklist');
    await direction.getByRole('textbox', { name: /Shots and details/ }).fill('Open on the summit shot');
    await direction.getByRole('button', { name: /^Next: check/ }).click();

    // 5 Check: one row per decision with Change, beside what the agent is told.
    await expect(direction.getByLabel('Your choices').getByRole('button', { name: /^Change/ })).toHaveCount(8);
    await direction.getByRole('button', { name: 'Change fonts' }).click();
    await expect(steps.getByRole('button', { name: /Fonts and music/ })).toHaveAttribute('aria-current', 'step');
    await steps.getByRole('button', { name: /Check/ }).click();
    const told = await direction.locator('.dx-told li').allInnerTexts();
    expect(told).toContain('Fonts: Fraunces for words, Geist Mono for numbers.');
    expect(told).toContain('Settings: B-roll heavy; Captions word-by-word; Pace calm (the owner\'s choice).');

    await direction.getByRole('textbox', { name: 'Name' }).fill('Weekend vlogs');
    await direction.getByRole('button', { name: 'Save style' }).click();
    await expect(direction.getByText('Saved as Weekend vlogs for you; Auto now uses it.')).toBeVisible();
    expect((await server.project.listStyles()).defaultId).toBe('weekend-vlogs');

    await direction.getByRole('button', { name: /Build the first cut/ }).click();
    await expect(page.getByRole('heading', { name: 'Directed', exact: true })).toBeVisible();
    await server.project.whenTranscribed('directed'); await server.project.whenAgentDone('directed');
    const copy = (await server.project.readReelStyle('directed'))!;
    expect(copy).toMatchObject({ id: 'creator', scope: 'project', form: 'vlog', yours: ['pace'], effects: ['checklist'], music: {} });
    // The agent receives exactly the lines Check showed.
    expect(agentTold(copy, { about: 'A weekend hike', frame: 'landscape', frameFound: true })).toEqual(told);
    const { request } = await server.project.copyAgentRequest('directed');
    for (const line of told) expect(request).toContain(`- ${line}`);
  } finally { await server.close(); }
});

test('Direct at phone width: start from another reel, turn a rule off, and a code-built form needs a brief', async ({ page }) => {
  const server = await serve();
  try {
    await server.project.saveStyle('project', {
      id: 'team-talks', name: 'Team talks', scope: 'project', basedOn: 'clean', look: 'clean', settings: { broll: 'light' },
      yours: [], effects: ['big-word'], rules: ['Keep captions low, under my chin', 'Never use stock footage'],
    });
    const { slug: earlier } = await server.project.startReel({ video: 'media/talk.mp4', title: 'Earlier', style: { id: 'team-talks' } });
    await server.project.whenTranscribed(earlier);

    await page.setViewportSize({ width: 390, height: 844 });
    const direction = await openDirection(page, server.url, 'Phone launch');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const steps = direction.getByRole('list', { name: 'Direction steps' });

    // The stepper jumps; another reel's style comes in as a copy, with its effects.
    await steps.getByRole('button', { name: /Style/ }).click();
    await direction.getByRole('combobox').selectOption({ label: 'Earlier' });
    await expect(direction.getByLabel('So far').getByRole('button', { name: 'From Earlier' })).toBeVisible();
    await expect(direction.getByLabel('So far').getByRole('button', { name: '1 effect' })).toBeVisible();

    await steps.getByRole('button', { name: /Check/ }).click();
    const rules = async () => (await direction.locator('.dx-told li').allInnerTexts()).filter((line) => line.startsWith('Rule'));
    expect(await rules()).toHaveLength(2);
    const rule = direction.getByRole('switch', { name: /Never use stock footage/ });
    await rule.click();
    await expect(rule).toHaveAttribute('aria-checked', 'false');
    expect(await rules()).toEqual(['Rule: "Keep captions low, under my chin".']);

    // A code-built form offers looks, not footage styles, and cannot build without what it is about.
    await steps.getByRole('button', { name: /What/ }).click();
    await direction.getByRole('radio', { name: /^Launch/ }).click();
    await expect(direction.getByText('Needed: there is no footage')).toBeVisible();
    await expect(direction.getByRole('button', { name: 'Build now with these' })).toBeDisabled();
    await direction.getByRole('textbox', { name: /What.s it about/ }).fill('Our new app in three steps');
    await direction.getByRole('button', { name: /^Next: style/ }).click();
    await expect(direction.getByRole('radiogroup', { name: 'Look' }).getByRole('radio')).toHaveText([/^Flat 2D/, /^Layered 2D/, /^Filmed 3D/]);
    await direction.getByRole('button', { name: 'Build now with these' }).click();
    await expect(page.getByRole('heading', { name: 'Phone launch', level: 1, exact: true })).toBeVisible();
    const brief = (await server.project.listReels()).reels.find((reel) => reel.slug === 'phone-launch')!.brief!;
    expect(brief.text).toBe('Our new app in three steps');
    expect(brief.request).toContain('- Style: layered-2d.');
    expect(await server.project.readReelStyle('phone-launch')).toMatchObject({ form: 'launch', look: 'layered-2d', settings: {} });
  } finally { await server.close(); }
});

test('Direct: your own font and music, chosen or dropped anywhere on Direction, are copied in and named in the style', async ({ page }) => {
  const server = await serve();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    const direction = await openDirection(page, server.url, 'Own files');
    await direction.getByRole('list', { name: 'Direction steps' }).getByRole('button', { name: /Fonts and music/ }).click();

    // A font from the card: a sample line, what it is for, and the license note.
    await direction.getByLabel('Drop your own font').last().setInputFiles(resolve('node_modules/@fontsource/outfit/files/outfit-latin-700-normal.woff2'));
    const font = direction.getByLabel('Your font');
    await expect(font).toContainText('Take the long way home.');
    await expect(font).toContainText(/Use a font you.re licensed to use\./);
    await font.getByRole('group', { name: 'Use it for' }).getByRole('button', { name: 'Numbers' }).click();
    await expect(font).toContainText('Geist stays for words.');

    // Music dropped on the page itself is routed to the Music row.
    const wav = readFileSync(resolve('tests/fixtures/legacy-effect.mp3')).toString('base64');
    const drop = async (name: string, base64: string) => {
      const transfer = await page.evaluateHandle(([file, data]) => {
        const bytes = Uint8Array.from(atob(data!), (c) => c.charCodeAt(0));
        const t = new DataTransfer();
        t.items.add(new File([bytes], file!));
        return t;
      }, [name, base64]);
      await direction.locator('h1').dispatchEvent('drop', { dataTransfer: transfer });
    };
    await drop('theme.mp3', wav);
    const music = direction.getByLabel('Your music');
    await expect(music.getByRole('button', { name: 'Waveform; click to seek' }).locator('span').first()).toBeVisible({ timeout: 20_000 });
    await music.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(music.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await music.getByRole('button', { name: 'Pause', exact: true }).click();
    await music.getByRole('group', { name: 'Fit' }).getByRole('button', { name: 'Play under the cut' }).click();
    await expect(music).toContainText('Use music you have the rights to.');
    await drop('notes.txt', btoa('x'));
    await expect(direction.getByRole('alert')).toHaveText('notes.txt is not a font or a music file.');

    await direction.getByRole('list', { name: 'Direction steps' }).getByRole('button', { name: /Check/ }).click();
    const told = await direction.locator('.dx-told li').allInnerTexts();
    expect(told).toContain('Fonts: Geist for words, outfit latin 700 normal (fonts/outfit-latin-700-normal.woff2) for numbers.');
    expect(told).toContain('Music: footage/theme.mp3; play it under the cut; lower it under the voice.');
    await direction.getByRole('button', { name: /Build the first cut/ }).click();
    await expect(page.getByRole('heading', { name: 'Own files', exact: true })).toBeVisible();
    expect(await server.project.readReelStyle('own-files')).toMatchObject({
      fonts: { numbers: 'outfit latin 700 normal (fonts/outfit-latin-700-normal.woff2)' },
      music: { file: 'footage/theme.mp3', fit: 'under', duck: true },
    });
    expect(existsSync(join(server.dir, 'fonts', 'outfit-latin-700-normal.woff2'))).toBe(true);
  } finally { await server.close(); }
});
