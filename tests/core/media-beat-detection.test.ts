import { spawnSync } from 'node:child_process';
import { createReadStream, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const HAS_LIBROSA = spawnSync(PYTHON, ['-c', 'import importlib.util,sys;sys.exit(0 if importlib.util.find_spec("librosa") else 1)']).status === 0;

it.skipIf(!HAS_LIBROSA)('detects original music bytes through the project service and refuses a changed source', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-beat-service-'));
  const file = join(dir, 'music.wav');
  expect(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t,0.5),0.015),sin(2*PI*1000*t),0)':s=22050:d=8", file]).status).toBe(0);
  const project = openProject(dir);

  const source = await project.importMedia('music.wav', createReadStream(file));
  const grid = await project.detectMediaBeats(source.id);
  expect(grid.tempo).toBeCloseTo(120, 0);
  expect(grid.beats.length).toBeGreaterThan(10);
  expect(await openProject(dir).detectMediaBeats(source.id)).toEqual(grid);
  writeFileSync(join(dir, source.path), 'changed');
  await expect(project.detectMediaBeats(source.id)).rejects.toThrow(/missing or changed/);

});
