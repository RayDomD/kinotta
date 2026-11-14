import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';

it('SimpleMake uses Clear for picked videos and displays descriptive unpicked notice', async () => {
  const { page, close } = await browserHarness();
  let deleteFootageCalls = 0;

  try {
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());

      if (url.pathname === '/api/videos') {
        await route.fulfill({
          json: {
            videos: [
              {
                name: 'project-video.mp4',
                path: 'footage/project-video.mp4',
                duration: 20,
                width: 1920,
                height: 1080,
              },
            ],
          },
        });
        return;
      }

      if (req.method() === 'DELETE' && url.pathname === '/api/footage') {
        deleteFootageCalls++;
        await route.fulfill({ json: { removed: true } });
        return;
      }

      if (url.pathname === '/api/agent/settings') {
        await route.fulfill({ json: { provider: 'claude' } });
        return;
      }

      if (url.pathname === '/api/styles') {
        await route.fulfill({ json: { styles: [], defaultId: '' } });
        return;
      }

      await route.fulfill({ json: {} });
    });

    await page.evaluate(() => {
      (window as any).mountSimpleMake();
    });

    // 1. Pick video from project
    const pickSelect = page.getByRole('combobox', { name: 'Or use a video in this project' });
    await pickSelect.waitFor();
    await pickSelect.selectOption('footage/project-video.mp4');

    // Button for picked video should be 'Clear' with title 'Clear selection'
    const clearBtn = page.getByRole('button', { name: 'Clear project-video.mp4' });
    await clearBtn.waitFor();
    expect(await clearBtn.textContent()).toBe('Clear');
    expect(await clearBtn.getAttribute('title')).toBe('Clear selection');

    // Clicking Clear does NOT delete the file on server, only unpicks it
    await clearBtn.click();
    expect(deleteFootageCalls).toBe(0);

    const notice = page.locator('p[role="status"]');
    await expect.poll(() => notice.textContent()).toContain('Unpicked project-video.mp4.');
  } finally {
    await close();
  }
}, 30_000);
