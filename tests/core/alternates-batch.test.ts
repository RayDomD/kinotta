import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';

describe('alternate batch feedback', () => {
  it('names the alternate in the reel, each dismissal with its reason and the alternate on a pin', async () => {
    const { dir } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addComment('parts', 1, { pin: { shot: '02', alternate: 'r2', x: 0.5, y: 0.5, element: 'label' }, text: 'B has the right energy' });
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    await project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r3', reason: 'Too slow' });
    const batch = await project.copyBatch('parts', 1);
    expect(batch.text).toContain('In the reel: B');
    expect(batch.text).toContain('Not this: C · Too slow');
    expect(batch.text).toContain('alternate B');
    expect(batch.text).toContain('B has the right energy');
  });
});
