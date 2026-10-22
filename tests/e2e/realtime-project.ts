import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FIXTURE_VIDEO = resolve(import.meta.dirname, '../fixtures/playback-stutter-4k50.mp4');

export function createStutterProject(slug: string) {
  const dir = join(tmpdir(), `kinotta-stutter-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(join(dir, 'footage'), { recursive: true });
  copyFileSync(FIXTURE_VIDEO, join(dir, 'footage', 'fixture.mp4'));

  const reelDir = join(dir, 'reels', slug);
  const v1Dir = join(reelDir, 'v1');
  mkdirSync(v1Dir, { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: `Playback ${slug}` }));

  const media = {
    schema: 1,
    tracks: [{ id: 'speech', name: 'Speech', order: 0, gain: 1, mute: false }],
    sources: [{ id: 'fixture', name: 'Fixture 4K50', kind: 'video', audio: true, duration: 8.8, path: '../../../footage/fixture.mp4' }],
    placements: [{ id: 'take', role: 'main', source: 'fixture', track: 'speech', in: 0, out: 8.8, speech: false }],
    sequence: ['take'],
  };

  writeFileSync(join(v1Dir, 'plan.json'), JSON.stringify({ duration: 8.8, clips: [], media }));
  writeFileSync(
    join(reelDir, 'plan.json'),
    JSON.stringify({
      duration: 8.8,
      clips: [],
      media: { ...media, sources: media.sources.map((s) => ({ ...s, path: '../../footage/fixture.mp4' })) },
    })
  );
  writeFileSync(join(v1Dir, 'media.json'), JSON.stringify({ media }));
  writeFileSync(join(v1Dir, 'shots.json'), JSON.stringify({ contract: 1, duration: 8.8, shots: [] }));
  writeFileSync(join(v1Dir, 'index.html'), '<!doctype html><html><body><script>window.DURATION=8.8;window.seek=()=>{};</script></body></html>');

  return dir;
}

