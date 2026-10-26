import { expect, test } from '@playwright/test';
import { copyFixture } from '../helpers/project.ts';
import { startServer } from '../../server/main.ts';
import { launchAgent } from '../../server/core/_internal/runner.ts';
import { resolve } from 'node:path';
import { AGENT_CUT_BY } from '../../server/core/index.ts';
import type { SnipOperation } from '../../server/core/model.ts';

test('agent cuts: shows in the Editor with its reason, can be resized, and can be restored', async ({ page }) => {
  const words = [
    { text: 'Hello', start: 0.5, end: 0.9 },
    { text: 'there', start: 3.0, end: 3.4 },
    { text: 'friends', start: 6.5, end: 7.0 },
  ];
  const server = await startServer({
    projectDir: copyFixture('footage-project'),
    port: 0,
    transcriber: async () => words,
    agent: {
      launch: async (input) => {
        await launchAgent({
          ...input,
          executable: {
            command: process.execPath,
            prefix: [resolve('tests/core/fake-broll-agent.mjs'), 'cuts'],
          },
        });
      },
    },
  });

  try {
    await server.project.saveAgentSettings({ provider: 'claude', confirmed: true });
    const { slug } = await server.project.startReel({
      video: 'media/talk.mp4',
      title: 'Agent cuts reel',
      agentConfirmed: true,
    });
    await server.project.whenTranscribed(slug);
    await server.project.whenAgentDone(slug);

    const job = await server.project.agentJob(slug);
    expect(job).toMatchObject({ state: 'succeeded', version: 2 });

    const edits = await server.project.readEditList(slug);
    expect(edits.operations).toHaveLength(1);
    const cutOp = edits.operations[0] as SnipOperation;
    expect(cutOp).toMatchObject({
      kind: 'snip',
      from: 1.5,
      to: 2.5,
      by: AGENT_CUT_BY,
      reason: 'Long pause before the answer',
    });

    // 1. Check in Editor (Review / Edits panel) that the agent cut shows with its reason
    await page.addInitScript(() => sessionStorage.setItem('kinotta-mode', 'editor'));
    await page.goto(server.url);
    await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: 'Agent cuts reel', exact: true }).click();
    await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('main', { name: 'Review' })).toBeVisible();

    const editsPanel = page.getByRole('list', { name: 'Edits' });
    await expect(editsPanel).toBeVisible();
    const cutCard = editsPanel.locator('.c');
    await expect(cutCard).toHaveCount(1);
    await expect(cutCard).toContainText('Long pause before the answer');
    await expect(cutCard).toContainText('agent-cut');

    // 2. Check in Simple mode timeline that cut can be resized and restored
    await page.getByRole('button', { name: 'Simple mode', exact: true }).click();

    const timeline = page.locator('section.sm-timeline[aria-label="Simple timeline"]');
    await expect(timeline).toBeVisible();
    await expect(timeline).toHaveAttribute('data-verify-cuts', '1');

    // Resize: drag the start handle of the cut to the right
    const startHandle = page.locator('.sm-cut-handle-start');
    await expect(startHandle).toBeVisible();
    await startHandle.scrollIntoViewIfNeeded();
    const handleBox = (await startHandle.boundingBox())!;
    const trackBox = (await page.locator('.sm-pin-track').boundingBox())!;
    const pixelsPerSecond = trackBox.width / 12;
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const targetX = startX + pixelsPerSecond * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, startY, { steps: 5 });
    await page.mouse.up();

    await expect.poll(async () => {
      const ops = (await server.project.readEditList(slug)).operations as SnipOperation[];
      return ops.length === 1 ? ops[0]!.from : 0;
    }).toBeGreaterThan(1.6);

    // Restore: click the cut, click 'Keep this cut'
    const cutBlock = page.locator('.sm-cut').first().getByRole('button', { name: /^Cut/ });
    await cutBlock.click();
    const popover = page.getByRole('dialog', { name: 'Cut details' });
    await expect(popover).toBeVisible();
    await popover.getByRole('button', { name: 'Keep this cut' }).click();

    await expect(timeline).toHaveAttribute('data-verify-cuts', '0');
    await expect.poll(async () => (await server.project.readEditList(slug)).operations.length).toBe(0);
  } finally {
    await server.close();
  }
});
