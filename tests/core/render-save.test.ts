import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer } from '../../server/main.ts';
import type { RenderJob } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const RENDER_TIMEOUT_MS = 180_000;
const move = { kind: 'element-offset' as const, clip: 'cube-lands', element: 'cube', x: 40, y: -20, scale: 1 };

describe('Save and render versus Render saved version (AM40)', () => {
  it('saves the pending edits as the next version, then renders that version', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addOperation(REEL, move);
    const seen: RenderJob[] = [];
    const stop = project.subscribe((event) => event.type === 'render-progress' && seen.push(event.job));

    const { version, job } = await project.saveAndRender({ reel: REEL, preset: 'draft' });

    expect(version).toBe(3);
    expect(job).toMatchObject({ reel: REEL, version: 3, preset: 'draft' });
    expect(existsSync(join(dir, 'reels', REEL, 'v3', 'kinotta-edits.css'))).toBe(true);
    expect((await project.readEditList(REEL)).operations).toEqual([]);
    await project.cancelRender(job.id);
    stop();
    expect(seen.every((j) => j.version === 3)).toBe(true);
  });

  it('starts no render when Save is refused, and keeps the edits and the saved versions', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    // Nothing to save: no render of the saved version slips through in its place.
    await expect(project.saveAndRender({ reel: REEL, preset: 'draft' })).rejects.toMatchObject({ code: 'invalid', message: 'There are no edits to save.' });
    expect(project.renderJobs()).toEqual([]);

    // A hand-off blocks Save, so it blocks Save and render too.
    await project.addOperation(REEL, move);
    await project.setNote(REEL, 2, 'Tighten the ending.');
    await project.copyBatch(REEL, 2, {});
    await expect(project.saveAndRender({ reel: REEL, preset: 'draft' })).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('batch') });
    expect(project.renderJobs()).toEqual([]);
    expect(existsSync(join(dir, 'reels', REEL, 'v3'))).toBe(false);
    expect((await project.readEditList(REEL)).operations).toHaveLength(1);
  });

  it('refuses an unknown preset before saving anything', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addOperation(REEL, move);

    await expect(project.saveAndRender({ reel: REEL, preset: 'poster' as never })).rejects.toMatchObject({ code: 'invalid' });
    expect(existsSync(join(dir, 'reels', REEL, 'v3'))).toBe(false);
    expect((await project.readEditList(REEL)).operations).toHaveLength(1);
  });
});

describe('the Render popover with unsaved edits', () => {
  it('asks which content to render, saves then renders on request, and renders nothing when Save is refused', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = copyFixture('showreel-project');
    const server = await startServer({ projectDir: dir, port: 0 });
    const browser = await chromium.launch();
    try {
      await server.project.addOperation(REEL, move);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(server.url);
      await page.getByRole('navigation', { name: 'Reels' }).getByRole('button', { name: /Product showreel/ }).click();
      await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
      await page.getByRole('group', { name: 'Version actions' }).getByRole('button', { name: 'Render v2' }).click();
      const form = page.getByRole('dialog', { name: 'Render v2' });
      const base = form.getByRole('group', { name: /1 unsaved edit/ });
      // Nothing is chosen for the owner: Render waits for an explicit choice.
      await expect.poll(() => base.getByRole('radio', { checked: true }).count()).toBe(0);
      expect(await form.getByRole('button', { name: 'Render', exact: true }).isDisabled()).toBe(true);
      await base.getByRole('radio', { name: 'Saved v2' }).check();
      await form.getByRole('button', { name: 'Render v2', exact: true }).waitFor();
      await base.getByRole('radio', { name: 'Save as v3, then render' }).check();
      await form.getByRole('button', { name: 'Save as v3 and render', exact: true }).click();
      await expect.poll(() => existsSync(join(dir, 'reels', REEL, 'v3', 'index.html'))).toBe(true);
      await expect.poll(() => server.project.renderJobs().map((job) => job.version)).toEqual([3]);
      for (const job of server.project.renderJobs()) await server.project.cancelRender(job.id);

      // A refused Save shows its reason and queues nothing.
      await server.project.addOperation(REEL, move);
      await server.project.setNote(REEL, 3, 'Tighten the ending.');
      await server.project.copyBatch(REEL, 3, {});
      await page.reload();
      await page.getByRole('navigation', { name: 'Phase' }).getByRole('button', { name: 'Review' }).click();
      await page.getByRole('group', { name: 'Version actions' }).getByRole('button', { name: 'Render v3' }).click();
      const again = page.getByRole('dialog', { name: 'Render v3' });
      await again.getByRole('radio', { name: 'Save as v4, then render' }).check();
      await again.getByRole('button', { name: 'Save as v4 and render', exact: true }).click();
      await again.getByRole('alert').filter({ hasText: 'batch' }).waitFor();
      expect(server.project.renderJobs()).toEqual([]);
      expect(existsSync(join(dir, 'reels', REEL, 'v4'))).toBe(false);
    } finally {
      await browser.close();
      await server.close();
    }
  });
});
