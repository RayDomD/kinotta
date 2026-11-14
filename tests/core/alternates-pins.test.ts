import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';

describe('alternate pins', () => {
  it('records the viewed revision and the current Working shot start', async () => {
    const { dir } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    const added = await project.addComment('parts', 1, { pin: { shot: '02', alternate: 'r2', x: 0.5, y: 0.5, element: 'label' }, text: 'Feedback on B' });
    expect(added.comment.pin).toMatchObject({ alternate: 'r2', shotName: 'proof' });
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    const later = await project.addComment('parts', 1, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'label' }, text: 'After B' });
    expect(later.comment.pin.time).toBe(3);
    await expect(project.addComment('parts', 1, { pin: { shot: '02', alternate: 'r99', x: 0.5, y: 0.5, element: 'label' }, text: 'Missing' })).rejects.toThrow('alternate');
  });

  it('carries the alternate identity while offered and flags it with a reason when removed', async () => {
    const { dir, reelDir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addComment('parts', 1, { pin: { shot: '02', alternate: 'r2', x: 0.5, y: 0.5, element: 'label' }, text: 'On B' });
    await project.buildParts('parts');
    expect((await project.listComments('parts', 2))[0].pin).toMatchObject({ alternate: 'r2' });
    manifest.shots[1].alternates = manifest.shots[1].alternates!.filter((alternate) => alternate.revision !== 'r2');
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    expect((await project.listComments('parts', 3))[0]).toMatchObject({ state: 'element-removed', stateReason: expect.stringContaining('alternate') });
  });
});
