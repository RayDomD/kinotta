import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { compositeArgs, encodeMedia, joinArgs, RENDER_THREADS } from '../../server/core/_internal/runner.ts';
import { mediaMixArgs, mediaRenderArgs } from '../../server/core/_internal/media-render.ts';
import type { MediaPlan } from '../../server/core/_internal/media-model.ts';

vi.mock('node:child_process', async (original) => ({
  ...await original<typeof import('node:child_process')>(),
  spawn: vi.fn(() => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
    queueMicrotask(() => child.emit('close', 0));
    return child;
  }),
}));

const media: MediaPlan = {
  schema: 1, sources: [{ id: 'sound', kind: 'audio', path: 'sound.wav', duration: 2 }],
  placements: [{ id: 'sound', role: 'audio', source: 'sound', in: 0, out: 2, at: 0 }], sequence: [],
};
const audio = { footage: 'source.mp4', pieces: [{ in: 0, out: 2 }], audio: 'hard' as const };

for (const [name, build] of Object.entries({
  composite: () => compositeArgs({ ...audio, fps: '30', width: 160, height: 90, crf: 23, out: 'out.mp4' }),
  join: () => joinArgs('list.txt', 'out.mp4', audio),
  media: () => mediaRenderArgs(media, '.', 'overlay.mov', 'out.mp4', 2, 160, 90, '30', 23).args,
  mix: () => mediaMixArgs(media, '.', 2, 0.1)!,
})) {
  it(`bounds the ${name} complex graph to the render thread budget`, () => {
    const args = build();
    expect(args).toContain('-filter_complex');
    expect(args.filter((arg) => arg === '-filter_complex_threads')).toHaveLength(1);
    expect(args[args.indexOf('-filter_complex_threads') + 1]).toBe(String(RENDER_THREADS));
  });
}

it('bounds a complex graph supplied directly to the encoder without duplicating an existing limit', async () => {
  for (const options of [[], ['-filter_complex_threads', String(RENDER_THREADS)]]) {
    await encodeMedia(['-i', 'in.mp4', ...options, '-filter_complex', '[0:v]null[v]', '-map', '[v]', 'out.mp4'], new AbortController().signal);
    const args = vi.mocked(spawn).mock.calls.at(-1)![1] as string[];
    expect(args.filter((arg) => arg === '-filter_complex_threads')).toHaveLength(1);
    expect(args[args.indexOf('-filter_complex_threads') + 1]).toBe(String(RENDER_THREADS));
  }
});
