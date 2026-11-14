import { expect, test } from '@playwright/test';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

for (const mode of ['editor', 'simple'] as const) {
test(`${mode} Copy requests clipboard permission during the click even when saving is delayed`, async ({ page }) => {
  await page.addInitScript((selected) => localStorage.setItem('kinotta-mode', selected), mode);
  const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
  try {
    await server.project.addComment('product-showreel', 2, {
      pin: { shot: '03', x: 0.5, y: 0.6, element: 'icons-word' },
      text: 'Keep this exact saved request.',
    });
    await page.addInitScript(() => {
      let clicking = false;
      document.addEventListener('click', () => {
        clicking = true;
        setTimeout(() => { clicking = false; }, 0);
      }, true);
      const write = navigator.clipboard.write.bind(navigator.clipboard);
      const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.write = (items) => clicking ? write(items) : Promise.reject(new DOMException('Click expired', 'NotAllowedError'));
      navigator.clipboard.writeText = (text) => clicking ? writeText(text) : Promise.reject(new DOMException('Click expired', 'NotAllowedError'));
    });
    await page.route('**/batch**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.continue();
    });
    await page.goto(server.url);
    if (mode === 'editor') {
      await page.locator('.copy .btn').click();
      await expect(page.locator('.copy [role="status"]')).toContainText('Copied 1 comment');
    } else {
      await page.getByRole('button', { name: /Regenerate \(1 pins\)/ }).click();
      await expect(page.locator('.sm-message[role="status"]')).toContainText('Request copied.');
    }
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Keep this exact saved request.');
  } finally {
    await server.close();
  }
});
}
