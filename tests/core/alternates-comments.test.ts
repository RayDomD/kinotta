import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';

describe('asking for alternates', () => {
  it('stores a request for two, three or four options and names it on the grouped batch heading', async () => {
    const { dir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    const comment = await project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Show different approaches', options: 3 });
    expect(comment.comment.options).toBe(3);
    await project.addOperation('parts', { kind: 'element-offset', clip: 'hook', element: 'label', x: 10, y: 0, scale: 1 });
    expect((await project.copyBatch('parts', 1)).text).toContain('Shot 02 · 3 alternates');
  });

  it('allows requests on one shot only and explains which shot already asked', async () => {
    const { dir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Options please', options: 2 });
    await expect(project.addComment('parts', 1, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'label' }, text: 'Other options', options: 4 })).rejects.toThrow('Shot 02');
  });

  it('clears an options request carried to an agent build so another shot can ask', async () => {
    const { dir } = partsFixture(3, false);
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addComment('parts', 1, { pin: { shot: '02', x: 0.5, y: 0.5, element: 'label' }, text: 'Options please', options: 3 });
    await project.buildParts('parts');
    expect((await project.listComments('parts', 2))[0].options).toBeUndefined();
    expect((await project.addComment('parts', 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: 'label' }, text: 'New options', options: 4 })).comment.options).toBe(4);
  });
});
