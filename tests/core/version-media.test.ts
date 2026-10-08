import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

describe('a version with independent media placements', () => {
  it('exposes the legacy editing identities and the actual source path base without rewriting the old plan', async () => {
    const dir = copyFixture('footage-project');
    const file = join(dir, 'motion/plan.json');
    const before = readFileSync(file, 'utf8');
    const model = await openProject(dir).readMediaModel('founder-talk');
    expect(model.sourceRoot).toBe('..');
    expect(model.media.sources[0]!.id).toBe('legacy:../media/talk.mp4');
    expect(model.media.sources[0]!.audio).toBe(false);
    expect(model.legacySources?.videoAudio).toBe(false);
    expect(model.duration).toBe(12);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it('keeps silent legacy footage silent when Save freezes its source, preserving the earlier version', async () => {
    const dir = copyFixture('footage-project');
    const previous = join(dir, 'reels/founder-talk/v1/index.html');
    const before = readFileSync(previous, 'utf8');
    const project = openProject(dir);
    const model = await project.readMediaModel('founder-talk');
    await project.addOperation('founder-talk', { kind: 'placement-change', placement: model.media.sequence[0]!, changes: { gain: 0.5 } });
    expect(await project.saveEdits('founder-talk')).toEqual({ version: 2 });
    const saved = await project.readVersion('founder-talk', 2);
    expect(saved.media!.sources[0]!.audio).toBe(false);
    expect(saved.duration).toBe(12);
    expect(readFileSync(previous, 'utf8')).toBe(before);
  });
  it('reads each take and repeated speech occurrence with a distinct placement target', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, 'reels/founder-talk/v1/plan.json'), JSON.stringify({
      media: {
        schema: 1,
        sources: [
          { id: 'a', kind: 'video', path: '../../../media/talk.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }] },
          { id: 'b', kind: 'video', path: '../../../media/other.mp4', duration: 12, words: [{ text: 'product', start: 1, end: 1.5 }] },
        ],
        placements: [
          { id: 'a-first', role: 'main', source: 'a', in: 0, out: 3 },
          { id: 'b-first', role: 'main', source: 'b', in: 0, out: 3 },
          { id: 'a-second', role: 'main', source: 'a', in: 0, out: 3 },
        ],
        sequence: ['a-first', 'b-first', 'a-second'],
      },
    }));

    const version = await openProject(dir).readVersion('founder-talk', 1);

    expect(version.duration).toBe(9);
    expect(version.media?.sequence).toEqual(['a-first', 'b-first', 'a-second']);
    expect(version.transcript?.map((w) => [w.text, w.start, w.placement, w.sourceStart])).toEqual([
      ['hello', 1, 'a-first', 1], ['product', 4, 'b-first', 1], ['hello', 7, 'a-second', 1],
    ]);
    const comment = await openProject(dir).addComment('founder-talk', 1, { text: 'Repeated speech beyond the authored shots', pin: { kind: 'word', shot: '', placement: 'a-second', time: 7, word: 'hello' } });
    expect(comment.comment.pin).toMatchObject({ placement: 'a-second', time: 7, sourceTime: 1, section: version.sections[1]!.id });
    const frame = await openProject(dir).addComment('founder-talk', 1, { text: 'Later frame beyond the authored shots', pin: { kind: 'frame', shot: '', placement: 'a-second', time: 7.2, x: 0.5, y: 0.5, element: null } });
    expect(frame.comment.pin.section).toBe(version.sections[1]!.id);
  });

  it('keeps a targeted correction through reopen and history, then flags it if an agent removes that use', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels/founder-talk');
    const media = {
      schema: 1,
      sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
      placements: [
        { id: 'first', role: 'main', source: 'a', in: 0, out: 3 },
        { id: 'second', role: 'main', source: 'a', in: 0, out: 3 },
      ],
      sequence: ['first', 'second'],
    };
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({ media }));
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'word-text', placement: 'second', at: 1, text: 'world' });
    const reopened = openProject(dir);

    expect((await reopened.readEditList('founder-talk')).operations[0]).toMatchObject({ placement: 'second', text: 'world' });
    expect((await reopened.undoEdit('founder-talk')).operations).toEqual([]);
    expect((await reopened.redoEdit('founder-talk')).operations).toHaveLength(1);
    mkdirSync(join(reelDir, 'v2'));
    cpSync(join(reelDir, 'v1/index.html'), join(reelDir, 'v2/index.html'));
    cpSync(join(reelDir, 'v1/shots.json'), join(reelDir, 'v2/shots.json'));
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({ media: { ...media, placements: [media.placements[0]], sequence: ['first'] } }));
    const replayed = await reopened.readEditList('founder-talk');

    expect(replayed.base).toBe(2);
    expect(replayed.replayedFrom).toBe(1);
    expect((await openProject(dir).readEditList('founder-talk')).replayedFrom).toBe(1);
    expect(Object.values(replayed.flagged ?? {})).toEqual(['Speech placement second is missing.']);
    expect(replayed.canUndo).toBe(false);
    expect(replayed.operations).toHaveLength(1);
    await expect(reopened.saveEdits('founder-talk')).rejects.toThrow('no longer applies');
    expect((await reopened.addOperation('founder-talk', { kind: 'word-text', placement: 'first', at: 1, text: 'again' })).replayedFrom).toBe(1);
    expect((await reopened.undoEdit('founder-talk')).replayedFrom).toBe(1);
    expect((await reopened.discardEdits('founder-talk')).replayedFrom).toBeUndefined();
  });

  it('saves an independent caption correction and preserves the exact source bytes in the new version', async () => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels/founder-talk');
    const sourceFile = join(dir, 'media/talk.mp4');
    const original = readFileSync(sourceFile);
    writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({
      title: 'Repeated speech', clips: [], captions: true,
      sections: [{ id: 'all', name: 'All', start: 0, end: 6 }],
      media: {
        schema: 1,
        sources: [{ id: 'a', kind: 'video', path: '../../media/talk.mp4', duration: 12, words: [{ text: 'hello', start: 1, end: 1.5 }] }],
        placements: [
          { id: 'first', role: 'main', source: 'a', in: 0, out: 3 },
          { id: 'second', role: 'main', source: 'a', in: 0, out: 3 },
        ],
        sequence: ['first', 'second'],
      },
    }));
    const project = openProject(dir);
    await project.addOperation('founder-talk', { kind: 'word-text', placement: 'second', at: 1, text: 'world' });

    expect(await project.saveEdits('founder-talk')).toEqual({ version: 2 });
    writeFileSync(sourceFile, 'changed original');
    const saved = await project.readVersion('founder-talk', 2);
    expect(saved.transcript?.map((w) => w.text)).toEqual(['hello', 'world']);
    expect(readFileSync(resolve(reelDir, 'v2', saved.media!.sources[0]!.path))).toEqual(original);
    expect(await project.mediaFile('a', { reel: 'founder-talk', version: 2 })).toBe(resolve(reelDir, 'v2', saved.media!.sources[0]!.path));
    expect((await project.readEditList('founder-talk')).operations).toEqual([]);
    await project.addOperation('founder-talk', { kind: 'word-text', placement: 'second', at: 1, text: 'again' });
    await expect(project.saveEdits('founder-talk')).rejects.toThrow('changed');
    expect((await project.listVersions('founder-talk')).map((v) => v.number)).toEqual([1, 2]);
    expect((await openProject(dir).readEditList('founder-talk')).operations).toHaveLength(1);
    expect(readFileSync(resolve(reelDir, 'v2', saved.media!.sources[0]!.path))).toEqual(original);
  });
});
