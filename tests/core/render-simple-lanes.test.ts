import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

it('exercises three-lane simple timeline: caption editing, snap toggle, neighbour constraint, amber marks, persistence and empty pins', { timeout: 90_000 }, async () => {
  const dir = copyFixture('footage-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=lime:s=160x90:r=30:d=4', '-c:v', 'libx264', join(dir, 'take.mp4')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);

  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({
    schema: 1,
    sources: [
      {
        id: 'take',
        name: 'Take',
        kind: 'video',
        duration: 4,
        audio: false,
        path: `${prefix}take.mp4`,
        words: [
          { text: 'hello', start: 0.5, end: 0.9 },
          { text: 'world', start: 1.2, end: 1.8 },
        ],
      },
    ],
    placements: [{ id: 'first', role: 'main', source: 'take', in: 0, out: 4 }],
    sequence: ['first'],
  });

  const plan = {
    title: 'Founder talk: going local-first',
    duration: 4,
    captions: true,
    sections: [{ id: 'all', name: 'All', start: 0, end: 4 }],
    clips: [{ id: 'card', title: 'Card', clip: 'card.html', placement: 'first', in: 0.5, out: 1.8, kind: 'overlay' }],
  };

  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ ...plan, media: media('../../') }));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ ...plan, media: media('../../../') }));

  const server = await startServer({ projectDir: dir, port: 0 });
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    // Store simple mode profile to bypass About You form
    await page.addInitScript(() => {
      localStorage.setItem(
        'kinotta-simple-profile-v1',
        JSON.stringify({ name: 'Alex', handle: '@alex', makes: 'Vlogs', language: 'English', destination: 'TikTok', finish: 'MP4', music: 'No music' }),
      );
    });

    await page.goto(`${server.url}/#founder-talk`);

    const timeline = page.getByRole('region', { name: 'Simple timeline' });
    await timeline.waitFor();

    // 1. Verify three lanes are present
    const addedLane = timeline.locator('[data-lane="added"]');
    const captionsLane = timeline.locator('[data-lane="captions"]');
    const videoLane = timeline.locator('[data-lane="video"]');

    expect(await addedLane.textContent()).toContain('Added by Kinotta');
    expect(await addedLane.locator('.sm-clip-added').textContent()).toContain('Card');

    expect(await captionsLane.textContent()).toContain('Captions');
    expect(await videoLane.textContent()).toContain('Your video');

    // Detailed editor controls should NOT be visible in simple mode
    expect(await page.getByRole('region', { name: 'Editor toolbar' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Add track', exact: true }).count()).toBe(0);

    const last = async () => {
      await expect.poll(async () => (await server.project.readEditList('founder-talk')).operations.length, { timeout: 5000 }).toBeGreaterThan(0);
      return (await server.project.readEditList('founder-talk')).operations.at(-1)!;
    };

    // 2. Open phrase
    const phraseButton = captionsLane.getByRole('button', { name: 'Open caption at 0.50', exact: true });
    await phraseButton.click();

    const wordHello = captionsLane.getByRole('button', { name: 'Edit word hello at 0.50 in first', exact: true });
    await wordHello.waitFor();

    // 3. Edit word and commit with Enter
    await wordHello.click();
    const wordInput = captionsLane.getByLabel('Word at 0.50 in first', { exact: true });
    await wordInput.fill('howdy');
    await wordInput.press('Enter');

    await expect.poll(last).toMatchObject({
      kind: 'word-text',
      placement: 'first',
      at: 0.5,
      text: 'howdy',
    });

    // 4. Amber mark on changed word
    const changedHello = captionsLane.locator('[data-word="first:0.5"]');
    await expect.poll(async () => (await changedHello.getAttribute('class'))?.includes('fixed')).toBe(true);

    // 5. Escape cancel on editing word
    // Caption remains open with words visible
    const wordWorld = captionsLane.getByRole('button', { name: 'Edit word world at 1.20 in first', exact: true });
    await wordWorld.click();
    const worldInput = captionsLane.getByLabel('Word at 1.20 in first', { exact: true });
    await worldInput.fill('planet');
    await worldInput.press('Escape');

    // Cancelled: text remains 'world'
    if (await captionsLane.getByRole('button', { name: 'Open caption at 0.50', exact: true }).count() > 0) {
      await captionsLane.getByRole('button', { name: 'Open caption at 0.50', exact: true }).click();
    }
    expect(await captionsLane.getByRole('button', { name: 'Edit word world at 1.20 in first', exact: true }).count()).toBe(1);

    // 6. Blur commit
    await captionsLane.getByRole('button', { name: 'Edit word world at 1.20 in first', exact: true }).click();
    const blurInput = captionsLane.getByLabel('Word at 1.20 in first', { exact: true });
    await blurInput.fill('folks');
    // Blur by clicking outside on timeline ruler
    await timeline.locator('.sm-ruler-wrap').click({ position: { x: 50, y: 10 } });

    await expect.poll(last).toMatchObject({
      kind: 'word-text',
      placement: 'first',
      at: 1.2,
      text: 'folks',
    });

    // 7. Whole-phrase edit in simple mode saves phrase-text
    const phraseButton2 = captionsLane.getByRole('button', { name: 'Open caption at 0.50', exact: true });
    await phraseButton2.click();
    await captionsLane.locator('[data-caption="0"]').dblclick();
    const phraseInput = captionsLane.getByLabel(/^Caption at/);
    await phraseInput.fill('fresh words');
    await phraseInput.press('Enter');
    await expect.poll(last, { timeout: 5000 }).toMatchObject({
      kind: 'phrase-text',
      placement: 'first',
      text: 'fresh words',
    });

    // 7. Snap toggle
    const snapToggle = captionsLane.getByRole('button', { name: 'Toggle snap', exact: true });
    expect(await snapToggle.getAttribute('aria-pressed')).toBe('false');
    await snapToggle.click();
    expect(await snapToggle.getAttribute('aria-pressed')).toBe('true');

    // 8. Keyboard retime and edge stop at neighbour
    await captionsLane.getByRole('button', { name: 'Open caption at 0.50', exact: true }).click();
    const endEdge = captionsLane.getByLabel('Word end at 0.50 in first', { exact: true });
    await endEdge.focus();

    // Nudge right several times: neighbour is 'folks' starting at 1.2
    for (let i = 0; i < 5; i++) {
      await endEdge.press('ArrowRight');
    }

    // Should stop at 1.2 (neighbour's start), not push past it
    await expect.poll(async () => {
      const op = await last();
      return op.kind === 'word-timing' ? op.end : null;
    }).toBeCloseTo(1.2, 2);

    // 9. Working persistence after reload
    await page.reload();
    await timeline.waitFor();

    const reloadedPhrase = captionsLane.getByRole('button', { name: /^Open caption at/ });
    await reloadedPhrase.click();

    // Edited words are preserved (phrase-text updated the words)
    expect(await captionsLane.getByRole('button', { name: /^Edit word fresh at/ }).count()).toBe(1);
    expect(await captionsLane.getByRole('button', { name: /^Edit word words at/ }).count()).toBe(1);

    // 10. Empty space pin: clicking empty space seeks and opens frame pin composer without caption ops
    const opsCountBefore = (await server.project.readEditList('founder-talk')).operations.length;
    const ruler = timeline.locator('.sm-ruler-wrap');
    const rulerBox = (await ruler.boundingBox())!;

    // Pins need pin mode; then click around 2.5s (2.5 / 4 * width)
    await page.getByRole('button', { name: 'Pin mode', exact: true }).click();
    await page.mouse.click(rulerBox.x + (rulerBox.width * 2.5) / 4, rulerBox.y + rulerBox.height / 2);

    const pinBubble = page.getByRole('form', { name: 'New pin', exact: true });
    await pinBubble.waitFor();
    expect(await pinBubble.locator('.sm-pin-context').textContent()).toMatch(/\d/);

    // Verify NO new caption operation was created
    const opsCountAfter = (await server.project.readEditList('founder-talk')).operations.length;
    expect(opsCountAfter).toBe(opsCountBefore);
  } finally {
    await browser.close();
    await server.close();
  }
});
