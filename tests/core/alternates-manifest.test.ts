import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { partsFixture } from '../helpers/parts.ts';

function fixture() {
  const fixture = partsFixture();
  const alternates = ['r1', 'r2', 'r3'].map((revision, index) => ({ revision, label: String.fromCharCode(65 + index), title: `Proof ${index + 1}`, note: `Approach ${index + 1}`, duration: index + 1 }));
  for (const revision of ['r2', 'r3']) cpSync(join(fixture.reelDir, 'shots/proof/r1'), join(fixture.reelDir, 'shots/proof', revision), { recursive: true });
  const manifest = { ...fixture.manifest, shots: fixture.manifest.shots.map((shot) => shot.name === 'proof' ? { ...shot, alternates } : shot) };
  writeFileSync(join(fixture.reelDir, 'v1/shots.json'), JSON.stringify(manifest));
  return { ...fixture, manifest, alternates };
}

describe('alternate manifests', () => {
  it('reads two to four named alternates and marks the revision in the reel', async () => {
    const { dir } = fixture();
    const shot = (await openProject(dir).readVersion('parts', 1)).shots[1];
    expect(shot.alternates).toHaveLength(3);
    expect(shot.alternates?.map((alternate) => [alternate.label, alternate.inReel, alternate.duration])).toEqual([['A', true, 1], ['B', false, 2], ['C', false, 3]]);
  });

  it.each(['too few', 'too many', 'repeated label', 'repeated revision', 'chosen missing', 'bad duration', 'missing revision'])('check reports %s', async (problem) => {
    const { dir, reelDir, manifest, alternates } = fixture();
    if (problem === 'too few') alternates.splice(1);
    if (problem === 'too many') alternates.push({ ...alternates[1], revision: 'r4', label: 'D' }, { ...alternates[1], revision: 'r5', label: 'E' });
    if (problem === 'repeated label') alternates[1].label = 'A';
    if (problem === 'repeated revision') alternates[1].revision = 'r1';
    if (problem === 'chosen missing') alternates[0].revision = 'r4';
    if (problem === 'bad duration') alternates[1].duration = 0;
    if (problem === 'missing revision') alternates[1].revision = 'r99';
    writeFileSync(join(reelDir, 'v1/shots.json'), JSON.stringify(manifest));
    const issues = (await openProject(dir).readVersion('parts', 1)).issues;
    expect(issues.some((issue) => issue.code === (problem === 'missing revision' ? 'parts-files' : 'parts-alternates'))).toBe(true);
  });
});
