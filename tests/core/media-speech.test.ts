import { spawnSync } from 'node:child_process';
import { createReadStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { Transcriber } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const WORDS = [{ text: 'hello', start: 0.2, end: 0.5 }];

/** A reel whose v1 uses one imported sound twice as selected speech, with no cached words yet. */
async function speechReel(transcriber: Transcriber) {
  const dir = copyFixture('footage-project');
  const tone = join(dir, 'tone.wav');
  const generated = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', tone], { encoding: 'utf8' });
  expect(generated.status, generated.stderr).toBe(0);
  const project = openProject(dir, { transcriber });
  const entry = await project.importMedia('Tone.wav', createReadStream(tone));
  const reel = join(dir, 'reels/founder-talk');
  const media = (prefix: string) => ({
    schema: 1,
    sources: [{ id: entry.id, name: 'Tone', kind: 'audio', path: prefix + entry.path, duration: 2, contentHash: entry.contentHash }],
    placements: [
      { id: 'first', role: 'audio', source: entry.id, at: 0, in: 0, out: 1, speech: true },
      { id: 'second', role: 'audio', source: entry.id, at: 2, in: 0, out: 1, speech: true },
    ],
    sequence: [],
  });
  writeFileSync(join(reel, 'v1/plan.json'), JSON.stringify({ duration: 4, media: media('../../../'), clips: [] }));
  writeFileSync(join(reel, 'plan.json'), JSON.stringify({ title: 'Speech', duration: 4, sections: [{ id: 'all', name: 'All', start: 0, end: 4 }], media: media('../../'), clips: [] }));
  return { dir, project, source: entry.id };
}

describe('speech for an imported source', () => {
  it('transcribes once when first used, reuses the cached words for every placement and freezes them on Save', async () => {
    let calls = 0;
    const { dir, project, source } = await speechReel(async () => { calls += 1; return WORDS; });

    expect(await project.mediaSpeech(source)).toEqual({ state: 'idle' });
    await project.addOperation('founder-talk', { kind: 'placement-change', placement: 'first', changes: { gain: 0.5 } });
    await expect(project.saveEdits('founder-talk')).rejects.toThrow('Speech for Tone is not transcribed yet');

    expect((await project.transcribeMedia(source)).state).toMatch(/running|ready/);
    await expect.poll(() => project.mediaSpeech(source)).toEqual({ state: 'ready', words: WORDS });
    expect(await project.transcribeMedia(source)).toEqual({ state: 'ready', words: WORDS });
    expect(await openProject(dir).mediaSpeech(source)).toEqual({ state: 'ready', words: WORDS });
    expect(calls).toBe(1);

    await project.saveEdits('founder-talk');
    const saved = await project.readVersion('founder-talk', 2);
    expect(saved.media!.sources[0]!.words).toEqual(WORDS);
    expect(saved.transcript?.map((w) => [w.text, w.start, w.placement])).toEqual([['hello', 0.2, 'first'], ['hello', 2.2, 'second']]);
  });

  it('reports a failed transcription with its reason and succeeds on retry', async () => {
    let calls = 0;
    const { project, source } = await speechReel(async () => {
      calls += 1;
      if (calls === 1) throw new Error('The speech model is not installed.');
      return WORDS;
    });

    await project.transcribeMedia(source);
    await expect.poll(() => project.mediaSpeech(source)).toEqual({ state: 'failed', error: 'The speech model is not installed.' });
    await project.transcribeMedia(source);
    await expect.poll(() => project.mediaSpeech(source)).toEqual({ state: 'ready', words: WORDS });
  });

  it('finds the source of a saved version that is not in the library', async () => {
    const { project, source } = await speechReel(async () => WORDS);

    await project.transcribeMedia(source, { reel: 'founder-talk', version: 1 });
    await expect.poll(() => project.mediaSpeech(source, { reel: 'founder-talk', version: 1 })).toEqual({ state: 'ready', words: WORDS });
    expect(await project.mediaSpeech('sha256:unknown')).toEqual({ state: 'failed', error: 'The original source is missing or changed. Relink it before transcribing.' });
  });
});
