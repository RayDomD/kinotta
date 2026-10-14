import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('parts batches', () => {
  it('keeps flagged feedback for a removed named shot in the pasted batch', async () => {
    const { dir, reelDir, manifest } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Keep this removed feedback' });
    manifest.shots.splice(1, 1);
    manifest.duration = 2;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    const batch = await project.copyBatch('parts', 2);
    expect(batch.text).toContain('Removed shot proof');
    expect(batch.text).toContain('Keep this removed feedback');
  });
  it('opens with the named shots to rebuild and groups their comments in play order', async () => {
    const { dir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    for (const [shot, text] of [['03', 'Finish'], ['01', 'Opening'], ['01', 'Second opening note']]) {
      await project.addComment('parts', 1, { pin: { shot, x: 0.5, y: 0.5, element: 'label' }, text });
    }
    const batch = await project.copyBatch('parts', 1);
    expect(batch.text.split('\n')[0]).toBe('Rebuild: hook, close');
    expect(batch.text).toContain('Shot 01 · hook');
    expect(batch.text).toContain('Shot 03 · close');
    expect(batch.text.indexOf('Second opening note')).toBeLessThan(batch.text.indexOf('Shot 03 · close'));
    expect(batch.count).toBe(3);
  });
});
