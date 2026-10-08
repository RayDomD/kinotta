import { spawnSync } from 'node:child_process';
import { createReadStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { emptyProject } from '../helpers/project.ts';

it('caches source peaks for reusable sound and keeps waveform failure separate from playback readiness', async () => {
  const dir = emptyProject();
  const file = join(dir, 'levels.wav');
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc=if(lt(t\\,0.5)\\,0.1\\,0.8):s=48000:d=1", file], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  const project = openProject(dir);
  const source = await project.importMedia('levels.wav', createReadStream(file));
  const wave = await project.mediaWaveform(source.id);
  expect(wave.state).toBe('ready');
  expect(wave.peaks.length).toBeGreaterThan(20);
  expect(wave.peaks[0]).toBeCloseTo(0.1, 3);
  expect(wave.peaks.at(-2)).toBeCloseTo(0.8, 3);
  expect(await openProject(dir).mediaWaveform(source.id)).toEqual(wave);
  expect((await project.listMedia())[0]!.state).toBe('ready');
  writeFileSync(join(dir, source.path), 'different content');
  expect((await project.mediaWaveform(source.id)).state).toBe('unavailable');
});
