import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from '../helpers/editor-test.ts';
import { startServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

test('Editor plays a Working sound before any version is frozen', async ({ page }) => {
  const dir = copyFixture('showreel-project');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', join(dir, 'pending.wav')], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const server = await startServer({ projectDir: dir, port: 0 });
  try {
    await server.project.addOperation('product-showreel', { kind: 'placement-add', source: { id: 'pending', kind: 'audio', path: '../../../pending.wav', duration: 1 }, placement: { id: 'pending-use', role: 'audio', source: 'pending', at: 0, in: 0, out: 1 } });
    const loaded = page.waitForResponse((response) => (response.url().includes('/2/pending') || response.url().includes('/pending/audio')) && response.url().includes('working=1') && response.status() === 200);
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await loaded;
    await expect(page.locator('.rv-transport')).toBeVisible();
    await page.locator('.rv-play').click();
    await expect.poll(async () => Number(await page.locator('[data-verify-unit="Transport"]').getAttribute('data-verify-time'))).toBeGreaterThan(0.2);
    expect((await server.project.listVersions('product-showreel')).map((version) => version.number)).toEqual([1, 2]);
  } finally { await server.close(); }
});
