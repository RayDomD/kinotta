import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';
import { applyOperations, mediaTimeline } from '../../server/core/model.ts';
import type { Sources } from '../../server/core/model.ts';

describe('alternate edits', () => {
  it('moves only attached sound when Use chooses a longer alternate', () => {
    const { manifest } = alternatesFixture();
    const sources: Sources = { words: [], plan: { parts: manifest, codeTiming: true, duration: 3, clips: manifest.shots.map((shot, index) => ({ id: shot.name, in: index, out: index + 1 })), media: { schema: 1, sequence: [], sources: [{ id: 'tone', kind: 'audio', path: 'tone.wav', duration: 0.2 }], placements: [
      { id: 'attached', role: 'audio', source: 'tone', at: 2.1, in: 0, out: 0.2, attachment: { placement: 'close', time: 0.1 } },
      { id: 'fixed', role: 'audio', source: 'tone', at: 2.1, in: 0, out: 0.2 },
    ] } } };
    const applied = applyOperations(sources, [{ id: 'use', by: 'you', kind: 'shot-alternate', shot: 'proof', revision: 'r2' }]);
    expect(mediaTimeline(applied.plan.media!, applied.plan.duration).placements.map((placement) => placement.at)).toEqual([3.1, 2.1]);
  });
  it('chooses an alternate on Working, moves later shots, undoes once and freezes the chosen revision', async () => {
    const { dir, reelDir } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    const list = await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    expect(list.operations[0]).toMatchObject({ kind: 'shot-alternate', by: 'you' });
    expect((await project.readWorkingVersion('parts')).workingParts?.shots.map((shot) => [shot.revision, shot.start, shot.duration])).toEqual([['r1', 0, 1], ['r2', 1, 2], ['r1', 3, 1]]);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    await project.undoEdit('parts');
    expect((await project.readWorkingVersion('parts')).workingParts?.shots[1].revision).toBe('r1');
    await project.redoEdit('parts');
    const frozen = await project.freezeEdits('parts');
    const version = await project.readVersion('parts', frozen.version);
    expect(version.issues).toEqual([]);
    expect(version.shots[1]).toMatchObject({ revision: 'r2', duration: 2, choiceMade: true });
  });

  it('dismisses an alternate with a reason, preserves it in the manifest for feedback, and undoes the dismissal', async () => {
    const { dir } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r2', reason: 'Too slow' });
    expect((await project.readWorkingVersion('parts')).workingParts?.shots[1].alternates?.[1].dismissed).toEqual({ reason: 'Too slow' });
    await expect(project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' })).rejects.toThrow('dismissed');
    await expect(project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r1', reason: '' })).rejects.toThrow('in the reel');
    await project.undoEdit('parts');
    expect((await project.readWorkingVersion('parts')).workingParts?.shots[1].alternates?.[1].dismissed).toBeUndefined();
  });
});
