import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyFixture } from '../helpers/project.ts';

export function colourFixture(empty = false): string {
  const dir = copyFixture('footage-project');
  const version = join(dir, 'reels', 'founder-talk', 'v1');
  const file = join(version, 'colour.mp4');
  if (!empty) {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x404040:s=640x360:r=24:d=12', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  const media = { schema: 1, sources: empty ? [] : [{ id: 'colour-video', name: 'Colour sample', kind: 'video', path: 'colour.mp4', duration: 12, audio: true }], placements: empty ? [] : [{ id: 'first-picture', role: 'main', source: 'colour-video', in: 0, out: 6 }, { id: 'second-picture', role: 'main', source: 'colour-video', in: 6, out: 12 }], sequence: empty ? [] : ['first-picture', 'second-picture'] };
  const plan = { title: 'Founder talk: going local-first', duration: 12, clips: [], media };
  writeFileSync(join(version, 'plan.json'), JSON.stringify(plan));
  const working = structuredClone(plan);
  working.media.sources.forEach((source) => { source.path = `v1/${source.path}`; });
  writeFileSync(join(dir, 'reels', 'founder-talk', 'plan.json'), JSON.stringify(working));
  return dir;
}
