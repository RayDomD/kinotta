import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'founder-talk';
/** One measuring window: spans are reported to this precision. */
const WINDOW = 0.01;

function tone(file: string, level: number, seconds: number): void {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${level}:s=48000:d=${seconds}`, file], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
}

/** Music at 0.6 for three seconds, and an effect at 0.6 over its second second: together they pass full scale. */
function overloadedReel() {
  const dir = copyFixture('footage-project');
  const reel = join(dir, 'reels', REEL);
  tone(join(dir, 'music.wav'), 0.6, 3);
  tone(join(dir, 'hit.wav'), 0.6, 1);
  const plan = (root: string) => ({
    title: 'Overload', duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], clips: [],
    media: {
      schema: 1,
      sources: [{ id: 'music', kind: 'audio', path: `${root}music.wav`, duration: 3 }, { id: 'hit', kind: 'audio', path: `${root}hit.wav`, duration: 1 }],
      placements: [{ id: 'song', role: 'audio', source: 'music', at: 0, in: 0, out: 3 }, { id: 'effect', role: 'audio', source: 'hit', at: 1, in: 0, out: 1 }],
      sequence: [],
    },
  });
  writeFileSync(join(reel, 'plan.json'), JSON.stringify(plan('../../')));
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify(plan('../../../')));
  writeFileSync(join(reel, 'v1/shots.json'), JSON.stringify({ contract: 1, duration: 3, sections: [{ id: 'all', name: 'All', start: 0, end: 3 }], shots: [] }));
  writeFileSync(join(reel, 'v1/index.html'), '<!doctype html><html class="alpha"><script>window.DURATION=3;window.seek=()=>{};</script>');
  return { dir, project: openProject(dir) };
}

describe('mix overload (AM29, AM38)', () => {
  it('finds where the rendered mix passes full scale, with its peak, and nowhere else', async () => {
    const { project } = overloadedReel();

    const { spans } = await project.mixOverload(REEL);

    expect(spans).toHaveLength(1);
    expect(spans[0]!.start).toBeCloseTo(1, 1);
    expect(spans[0]!.end).toBeCloseTo(2, 1);
    expect(Math.abs(spans[0]!.end - spans[0]!.start - 1)).toBeLessThanOrEqual(2 * WINDOW);
    expect(spans[0]!.peak).toBeCloseTo(1.2, 2);
  });

  it('measures pending edits, leaving the saved version as it was, and never changes a level itself', async () => {
    const { project } = overloadedReel();

    await project.addOperation(REEL, { kind: 'placement-change', placement: 'effect', changes: { gain: 0.5 } });

    expect((await project.mixOverload(REEL)).spans).toEqual([]);
    expect((await project.mixOverload(REEL, 1)).spans).toHaveLength(1);
    // A level at twice the recording is allowed (AM38), and it is reported rather than limited.
    await project.addOperation(REEL, { kind: 'placement-change', placement: 'song', changes: { gain: 2 } });
    const loud = (await project.mixOverload(REEL)).spans;
    expect(loud).toHaveLength(1);
    expect(loud[0]!.start).toBeCloseTo(0, 1);
    expect(loud[0]!.end).toBeCloseTo(3, 1);
    expect(loud[0]!.peak).toBeCloseTo(1.5, 2);
  });
});
