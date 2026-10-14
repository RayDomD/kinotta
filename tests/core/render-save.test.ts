import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const RENDER_TIMEOUT_MS = 180_000;
const move = { kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x: 40, y: -20, scale: 1 };

describe('working renders and explicit frozen renders', () => {
  it('keeps a Draft live during a hand-off without creating another version', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addOperation(REEL, move);
    await project.setNote(REEL, 2, 'Tighten the ending.');
    await project.copyBatch(REEL, 2);
    await project.addOperation(REEL, { ...move, x: 20 });
    const job = await project.renderWorking({ reel: REEL, preset: 'draft' });
    expect(job).toMatchObject({ working: true, version: 3 });
    expect(existsSync(join(dir, 'reels', REEL, 'v4'))).toBe(false);
    expect((await project.readEditList(REEL)).operations).toHaveLength(2);
    await project.cancelRender(job.id);
  });

  it('refuses an unknown preset before freezing or queuing anything', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addOperation(REEL, move);
    await expect(project.renderWorking({ reel: REEL, preset: 'poster' as never })).rejects.toMatchObject({ code: 'invalid' });
    expect(existsSync(join(dir, 'reels', REEL, 'v3'))).toBe(false);
    expect(project.renderJobs()).toEqual([]);
    expect((await project.readEditList(REEL)).operations).toHaveLength(1);
  });

  it('renders Working from the popover without Save and renders explicit history separately', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const server = await startServer({ projectDir: dir, port: 0 });
    const browser = await chromium.launch();
    try {
      await server.project.addOperation(REEL, move);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(server.url);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
      await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
      await page.getByRole('button', { name: 'Render Working', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Render Working' });
      expect(await form.getByRole('radio', { name: 'Draft of Working' }).isChecked()).toBe(true);
      expect(await form.getByText('Save', { exact: true }).count()).toBe(0);
      await form.getByRole('button', { name: 'Render', exact: true }).click();
      await expect.poll(() => server.project.renderJobs().some((job) => job.working === true)).toBe(true);
      expect(existsSync(join(dir, 'reels', REEL, 'v3'))).toBe(false);
      for (const job of server.project.renderJobs()) await server.project.cancelRender(job.id);
      const frozen = await server.project.render({ reel: REEL, version: 1, preset: 'draft' });
      expect(frozen.working).toBeUndefined();
      expect(frozen.version).toBe(1);
      await server.project.cancelRender(frozen.id);
    } finally { await browser.close(); await server.close(); }
  });
});
