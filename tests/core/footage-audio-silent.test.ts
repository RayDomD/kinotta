import { describe, expect, it, vi } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const runner = vi.hoisted(() => ({ makeAudioFile: vi.fn() }));
vi.mock('../../server/core/_internal/runner.ts', async (original) => {
  const actual = await original<typeof import('../../server/core/_internal/runner.ts')>();
  runner.makeAudioFile.mockImplementation(actual.makeAudioFile);
  return { ...actual, makeAudioFile: runner.makeAudioFile };
});

describe('reel footage without sound', () => {
  it('never tries to extract an audio file, however often the editor asks', async () => {
    // The fixture's talk.mp4 has a video stream only.
    const kinotta = openProject(copyFixture('footage-project'));
    for (let ask = 0; ask < 3; ask += 1) expect(await kinotta.footageAudioFile('founder-talk')).toBeNull();
    await new Promise((done) => setTimeout(done, 500));
    expect(runner.makeAudioFile).not.toHaveBeenCalled();
  });
});
