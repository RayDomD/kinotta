import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { emptyProject } from '../helpers/project.ts';

vi.mock('../../server/core/_internal/runner.ts', async (importActual) => ({
  ...await importActual<typeof import('../../server/core/_internal/runner.ts')>(),
  probeMedia: vi.fn(),
}));
vi.mock('../../server/core/_internal/import.ts', async (importActual) => ({
  ...await importActual<typeof import('../../server/core/_internal/import.ts')>(),
  ensureProxyAndAudio: vi.fn().mockResolvedValue(undefined),
  ensurePlaybackCopy: vi.fn().mockResolvedValue(undefined),
}));

import { mediaFile } from '../../server/core/_internal/media-library.ts';
import { probeMedia } from '../../server/core/_internal/runner.ts';
import { contentPlaybackPath, ensurePlaybackCopy, hashOf } from '../../server/core/_internal/import.ts';

it('retries failed codec probes and deduplicates concurrent retries without serving unsupported originals', async () => {
  const dir = emptyProject();
  const versionDir = join(dir, 'reels', 'probe-retry', 'v1');
  mkdirSync(versionDir, { recursive: true });
  const original = join(versionDir, 'source.mov');
  writeFileSync(original, 'unique probe retry fixture');
  writeFileSync(join(versionDir, 'plan.json'), JSON.stringify({ media: { sources: [{ id: 'source', kind: 'video', path: 'source.mov' }] } }));
  const saved = { reel: 'probe-retry', version: 1 };
  try {
    vi.mocked(probeMedia).mockRejectedValueOnce(new Error('temporary ffprobe failure'));
    expect(await mediaFile(dir, 'source', saved)).toBeNull();
    expect(ensurePlaybackCopy).not.toHaveBeenCalled();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(probeMedia).mockImplementationOnce(async () => {
      await gate;
      return { codec: 'prores', duration: 1, audio: false };
    });
    const first = mediaFile(dir, 'source', saved);
    const second = mediaFile(dir, 'source', saved);
    await vi.waitFor(() => expect(probeMedia).toHaveBeenCalledTimes(2));
    release();
    const playback = contentPlaybackPath(dir, await hashOf(original, dir));
    expect(await Promise.all([first, second])).toEqual([playback, playback]);
    expect(await mediaFile(dir, 'source', saved)).toBe(playback);
    expect(probeMedia).toHaveBeenCalledTimes(2);
    expect(ensurePlaybackCopy).toHaveBeenCalledWith(dir, original, playback);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});