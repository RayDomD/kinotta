import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { alternatesFixture } from '../helpers/parts.ts';

describe('travelling alternates', () => {
  it.each(['omitted', 'explicit'] as const)('keeps the frozen owner choice when the authored entry is unchanged (%s)', async (list) => {
    const { dir, reelDir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    await project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r3', reason: 'Too slow' });
    await project.freezeEdits('parts');
    if (list === 'omitted') delete manifest.shots[1].alternates;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    const shot = (await project.readVersion('parts', 3)).shots[1];
    expect(shot).toMatchObject({ revision: 'r2', choiceMade: true, duration: 2 });
    expect(shot.alternates?.filter((alternate) => !alternate.dismissed).map((alternate) => alternate.revision)).toEqual(['r1', 'r2']);
    await project.buildParts('parts');
    expect((await project.readVersion('parts', 4)).shots[1]).toMatchObject({ revision: 'r2', choiceMade: true });
    expect((await project.readVersion('parts', 4)).shots[1].alternates?.map((alternate) => alternate.revision)).toEqual(['r1', 'r2']);
  });

  it('uses a rebuilt explicit answer and never reoffers an explicitly listed dismissed revision', async () => {
    const { dir, reelDir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate', shot: 'proof', revision: 'r2' });
    await project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r3', reason: 'Too slow' });
    await project.freezeEdits('parts');
    cpSync(join(reelDir, 'shots/proof/r1'), join(reelDir, 'shots/proof/r4'), { recursive: true });
    manifest.shots[1].revision = 'r4';
    manifest.shots[1].alternates![0].revision = 'r4';
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    const shot = (await project.readVersion('parts', 3)).shots[1];
    expect(shot.revision).toBe('r4');
    expect(shot.alternates?.filter((alternate) => !alternate.dismissed).map((alternate) => alternate.revision)).toEqual(['r4', 'r2']);
  });
  it('reports a fifth travelling option as an invalid manifest without publishing', async () => {
    const { dir, reelDir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    for (const revision of ['r4', 'r5']) cpSync(join(reelDir, 'shots/proof/r1'), join(reelDir, 'shots/proof', revision), { recursive: true });
    manifest.shots[1].revision = 'r4';
    delete manifest.shots[1].alternates;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    manifest.shots[1].revision = 'r5';
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await expect(project.buildParts('parts')).rejects.toMatchObject({ code: 'invalid' });
  });
  it('carries undismissed alternates when an agent omits the list and excludes dismissed revisions', async () => {
    const { dir, reelDir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    await project.addOperation('parts', { kind: 'shot-alternate-dismiss', shot: 'proof', revision: 'r3', reason: 'Too slow' });
    const shot = manifest.shots[1];
    delete shot.alternates;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts', 'Codex');
    expect((await project.readVersion('parts', 2)).shots[1].alternates?.map((alternate) => alternate.revision)).toEqual(['r1', 'r2']);
  });

  it('keeps unchosen options beside a new authored revision without copying their folders', async () => {
    const { dir, reelDir, manifest } = alternatesFixture();
    const project = openProject(dir);
    await project.buildParts('parts');
    cpSync(join(reelDir, 'shots/proof/r1'), join(reelDir, 'shots/proof/r4'), { recursive: true });
    manifest.shots[1].revision = 'r4';
    delete manifest.shots[1].alternates;
    writeFileSync(join(reelDir, 'shots.json'), JSON.stringify(manifest));
    await project.buildParts('parts');
    const shot = (await project.readVersion('parts', 2)).shots[1];
    expect(shot.revision).toBe('r4');
    expect(shot.alternates?.map((alternate) => alternate.revision)).toEqual(expect.arrayContaining(['r2', 'r3', 'r4']));
  });
});
