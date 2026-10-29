import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';

const DEFAULT_SETTINGS = { format: 'mp4', aspect: '16:9', audio: 'source', loudnorm: true, resolution: '1080p' };

it('RenderMenu disables button, shows Cancelling…, and guards against double-cancel while in flight', async () => {
  const { page, close } = await browserHarness();
  let releaseCancel!: (error: boolean) => void;
  const cancelGate = new Promise<boolean>((resolve) => {
    releaseCancel = resolve;
  });
  let deleteRequests = 0;

  try {
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());

      if (req.method() === 'DELETE' && url.pathname.includes('/api/renders/job-1')) {
        deleteRequests++;
        const shouldError = await cancelGate;
        if (shouldError) {
          await route.fulfill({ status: 500, json: { error: 'Cancel failed on server' } });
        } else {
          await route.fulfill({ json: { id: 'job-1', state: 'cancelled' } });
        }
        return;
      }

      if (url.pathname.includes('/render-settings')) {
        await route.fulfill({
          json: {
            settings: {
              final: DEFAULT_SETTINGS,
              draft: DEFAULT_SETTINGS,
              preview: DEFAULT_SETTINGS,
              overlay: DEFAULT_SETTINGS,
            },
          },
        });
        return;
      }

      if (url.pathname.includes('/overload')) {
        await route.fulfill({ json: { spans: [] } });
        return;
      }

      if (url.pathname.includes('/renders')) {
        await route.fulfill({ json: { renders: [] } });
        return;
      }

      await route.fulfill({ json: {} });
    });

    await page.evaluate(() => {
      (window as any).mountRenderMenu({
        slug: 'my-reel',
        version: 1,
        footage: true,
        working: false,
        jobs: [
          {
            id: 'job-1',
            reel: 'my-reel',
            version: 1,
            state: 'running',
            progress: 0.4,
            preset: 'preview',
          },
        ],
      });
    });

    // Open export popover
    const exportBtn = page.getByRole('button', { name: 'Export' });
    await exportBtn.waitFor();
    await exportBtn.click();

    const cancelBtn = page.getByRole('button', { name: 'Cancel v1 Preview' });
    await cancelBtn.waitFor();
    expect(await cancelBtn.isEnabled()).toBe(true);
    expect(await cancelBtn.textContent()).toBe('Cancel');

    // Click cancel - request begins and is gated
    await cancelBtn.click();

    // While in flight: button shows Cancelling… and is disabled
    await expect.poll(() => cancelBtn.textContent()).toBe('Cancelling…');
    expect(await cancelBtn.isDisabled()).toBe(true);
    expect(deleteRequests).toBe(1);

    // Attempt second click while in-flight (must be ignored due to cancellingIds guard)
    await cancelBtn.click({ force: true }).catch(() => {});
    expect(deleteRequests).toBe(1);

    // Release gate with error to test error recovery and banner
    releaseCancel(true);

    // After failure: button restores to enabled 'Cancel' and alert surfaces error
    await expect.poll(() => cancelBtn.textContent()).toBe('Cancel');
    expect(await cancelBtn.isEnabled()).toBe(true);

    const alert = page.getByRole('alert');
    await alert.waitFor();
    expect(await alert.textContent()).toContain('Cancel failed on server');
  } finally {
    releaseCancel(false);
    await close();
  }
}, 30_000);
