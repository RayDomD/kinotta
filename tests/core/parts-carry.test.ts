import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';

describe('parts pin identity', () => {
  it('records shotName and follows it through reorder and removal of another shot', async () => {
    const { dir, reelDir, manifest } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    const added = await project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Make proof clearer' });
    expect(added.comment.pin).toMatchObject({ shotName: 'proof' });
    const hook = manifest.shots[0];
    manifest.shots = [manifest.shots[1], manifest.shots[2]];
    manifest.duration = 2;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    const carried = await project.listComments('parts', 2);
    expect(carried[0].pin).toMatchObject({ shot: '01', shotName: 'proof', time: 0 });
    expect(carried[0].state).toBeUndefined();
    manifest.shots.unshift(hook);
    manifest.duration = 3;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    expect((await project.listComments('parts', 3))[0].pin).toMatchObject({ shot: '02', shotName: 'proof', time: 1 });
  });

  it('marks a removed named shot instead of assigning its pin to the new occupant', async () => {
    const { dir, reelDir, manifest } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Proof feedback' });
    manifest.shots.splice(1, 1);
    manifest.duration = 2;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    expect((await project.listComments('parts', 2))[0]).toMatchObject({ state: 'moment-removed', pin: { shotName: 'proof' } });
  });
});
