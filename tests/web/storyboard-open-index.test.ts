import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';

it('Storyboard resets openIndex and closes ShotSheet when version changes', async () => {
  const { page, close } = await browserHarness();

  const makeVersion = (number: number) => ({
    number,
    isNewest: true,
    duration: 10,
    shots: [
      {
        number: '1',
        title: 'Opening title',
        clip: '01',
        duration: 5,
        timecode: '0:00.0',
        section: 's1',
      },
      {
        number: '2',
        title: 'Main action',
        clip: '02',
        duration: 5,
        timecode: '0:05.0',
        section: 's1',
      },
    ],
    sections: [{ id: 's1', name: 'Main', start: 0, duration: 10 }],
    clips: [],
    transcript: [],
    overlays: [],
  });

  try {
    await page.route('**/reels/**', async (route) => {
      await route.fulfill({ body: '<html><body>Mock stage</body></html>' });
    });

    await page.evaluate((version) => {
      const host = window as any;
      host.mountStoryboard({
        slug: 'test-reel',
        version,
        newest: 1,
        comments: [],
        sectionId: 's1',
        onSection: () => {},
        save: async () => {},
        reveal: null,
        issues: { messages: [], unavailable: new Map() },
      });
    }, makeVersion(1));

    // Initially sheet is not open
    expect(await page.locator('[data-verify-unit="ShotSheet"]').count()).toBe(0);

    // Click on the first shot to open ShotSheet
    const openBtn = page.locator('.fx-shot-slot button.open').first();
    await openBtn.waitFor();
    await openBtn.click();

    // ShotSheet dialog is now open
    const sheet = page.locator('[data-verify-unit="ShotSheet"]');
    await sheet.waitFor();
    expect(await sheet.isVisible()).toBe(true);

    // Change version (simulating user switching versions or external update)
    await page.evaluate((v2) => {
      (window as any).setStoryboardVersion(v2);
    }, makeVersion(2));

    // ShotSheet must be closed because openIndex was reset to null
    await expect.poll(() => sheet.count()).toBe(0);
  } finally {
    await close();
  }
}, 30_000);
