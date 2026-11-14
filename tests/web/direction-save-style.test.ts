import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';

const CLEAN_STYLE = {
  id: 'clean',
  name: 'Clean',
  scope: 'builtin',
  look: 'clean',
  settings: {
    broll: 'light',
    captions: 'phrases',
    pace: 'normal',
  },
  yours: [],
  effects: [],
  rules: [],
};

it('Direction disables Save style button, shows Saving…, and guards against double-submit while saving', async () => {
  const { page, close } = await browserHarness();
  let releaseSave!: (error: boolean) => void;
  const saveGate = new Promise<boolean>((resolve) => {
    releaseSave = resolve;
  });
  let saveRequests = 0;

  try {
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());

      if (req.method() === 'PUT' && url.pathname === '/api/styles') {
        saveRequests++;
        const shouldError = await saveGate;
        if (shouldError) {
          await route.fulfill({ status: 500, json: { error: 'Database error saving style' } });
        } else {
          const body = req.postDataJSON();
          await route.fulfill({ json: body.style });
        }
        return;
      }

      if (req.method() === 'PUT' && url.pathname === '/api/styles/default') {
        await route.fulfill({ json: { id: 'my-custom-style' } });
        return;
      }

      if (url.pathname === '/api/styles') {
        await route.fulfill({
          json: {
            styles: [CLEAN_STYLE],
            defaultId: 'clean',
          },
        });
        return;
      }

      if (url.pathname === '/api/reels') {
        await route.fulfill({ json: { state: 'ok', reels: [] } });
        return;
      }

      if (url.pathname === '/api/brand/fonts') {
        await route.fulfill({ json: { fonts: [] } });
        return;
      }

      await route.fulfill({ json: {} });
    });

    await page.evaluate(() => {
      (window as any).mountDirection({
        video: {
          name: 'test.mp4',
          path: 'footage/test.mp4',
          width: 1920,
          height: 1080,
          duration: 30,
        },
        footage: true,
        onBack: () => {},
        onStarted: () => {},
        onBriefStarted: () => {},
      });
    });

    // Go to step 5 (Check)
    const step5 = page.getByRole('button', { name: /Check/ });
    await step5.waitFor();
    await step5.click();

    const saveInput = page.getByPlaceholder('e.g. Weekend vlogs');
    await saveInput.waitFor();

    const saveBtn = page.getByRole('button', { name: /Save style|Saving/ });
    expect(await saveBtn.isDisabled()).toBe(true);

    // Type a name
    await saveInput.fill('My Custom Style');
    expect(await saveBtn.isEnabled()).toBe(true);
    expect(await saveBtn.textContent()).toBe('Save style');

    // Click Save style
    await saveBtn.click();

    // In flight: text is 'Saving…' and button is disabled
    await expect.poll(() => saveBtn.textContent()).toBe('Saving…');
    expect(await saveBtn.isDisabled()).toBe(true);
    expect(saveRequests).toBe(1);

    // Attempt second submit while in flight (must be guarded)
    await saveBtn.click({ force: true }).catch(() => {});
    expect(saveRequests).toBe(1);

    // Release gate with error
    releaseSave(true);

    // After failure: restores to enabled 'Save style' and shows error in status note
    await expect.poll(() => saveBtn.textContent()).toBe('Save style');
    expect(await saveBtn.isEnabled()).toBe(true);

    const note = page.locator('.dx-save .dx-note[role="status"]');
    await expect.poll(() => note.textContent()).toContain('Database error saving style');
  } finally {
    releaseSave(false);
    await close();
  }
}, 30_000);
