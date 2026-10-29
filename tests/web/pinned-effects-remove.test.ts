import { expect, it } from 'vitest';
import { browserHarness } from './browser.ts';

it('PinnedCommentCard allows editing after a failed deletion attempt', async () => {
  const { page, close } = await browserHarness();
  try {
    await page.evaluate(() => {
      const host = window as any;
      host.removeCalls = 0;
      host.editCalls = [];

      const comment = {
        id: 'c-test',
        number: 1,
        text: 'Initial text',
        pin: { shot: '1', kind: 'frame' },
        effect: 'some-fx',
        effectName: 'Highlight',
      };

      const state = {
        edit: async (id: string, text: string) => {
          host.editCalls.push({ id, text });
        },
      };

      // Simulated remove that fails (rejects), leaving the card on screen
      const remove = async () => {
        host.removeCalls++;
        throw new Error('Server failed to delete');
      };

      host.mountPinnedComment({
        comment,
        state,
        editable: true,
        remove,
      });
    });

    const deleteBtn = page.getByRole('button', { name: 'Delete pin 1' });
    await deleteBtn.waitFor();

    // Click Delete - will fail
    await deleteBtn.click();
    await expect.poll(() => page.evaluate(() => (window as any).removeCalls)).toBe(1);

    // Card should still be visible and allow new edits
    const textarea = page.getByRole('textbox', { name: /Highlight 1/ });
    await textarea.fill('New note after failed deletion');
    await textarea.blur();

    // The edit call must succeed and not be blocked by removal flag
    await expect.poll(() => page.evaluate(() => (window as any).editCalls)).toEqual([
      { id: 'c-test', text: 'New note after failed deletion' },
    ]);
  } finally {
    await close();
  }
}, 30_000);
