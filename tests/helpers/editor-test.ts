import { test as base } from '@playwright/test';
import { trackEditSaves } from './review-clock.ts';
export * from '@playwright/test';

/** Existing specs exercise the detailed editor; Simple mode specs use a fresh browser explicitly. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => { try { sessionStorage.setItem('kinotta-mode', 'editor'); } catch { /* Non-origin fixture page. */ } });
    trackEditSaves(page);
    await use(page);
  },
});
