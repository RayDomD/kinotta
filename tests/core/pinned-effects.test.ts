import { describe, expect, it, vi } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { alternatesFixture, partsFixture } from '../helpers/parts.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pin = { shot: '01', x: 0.5, y: 0.5, element: null };
describe('Storyboard pinned effects', () => {
  it('makes a title immediately as undoable Working content without creating an agent job', async () => {
    const { dir, reelDir } = partsFixture(3, false);
    const launch = vi.fn(async () => { throw new Error('Instant pins must never call an agent'); });
    const project = openProject(dir, { agent: { launch } });
    try {
      await project.buildParts('parts');
      const before = await readFile(join(reelDir, 'v1/index.html'), 'utf8');
      const result = await project.addComment('parts', 1, { pin, text: '', effect: 'title-card' });
      expect(result.comment).toMatchObject({ effect: 'title-card', instant: true, text: '' });
      expect(await project.agentJob('parts')).toBeNull();
      expect(launch).not.toHaveBeenCalled();
      expect(await project.workingPartsPage('parts')).toContain('data-pinned-effect');
      expect(await readFile(join(reelDir, 'v1/index.html'), 'utf8')).toBe(before);
      await project.undoEdit('parts');
      expect(await project.listComments('parts', 1)).toEqual([]);
      expect(await project.workingPartsPage('parts')).not.toContain('data-pinned-effect');
      await project.redoEdit('parts');
      expect((await project.listComments('parts', 1))[0].effect).toBe('title-card');
    } finally { await project.close(); }
  });
  it('routes notes and speech effects through one batch, excluding instant output', async () => {
    const { dir } = partsFixture(3, false);
    const project = openProject(dir);
    try {
      await project.buildParts('parts');
      const title = await project.addComment('parts', 1, { pin, text: '', effect: 'title-card' });
      await project.editComment('parts', 1, title.comment.id, 'Keep this small');
      expect((await project.listComments('parts', 1))[0].instant).toBeUndefined();
      expect(await project.workingPartsPage('parts')).not.toContain('data-pinned-effect');
      await project.editComment('parts', 1, title.comment.id, '');
      expect((await project.listComments('parts', 1))[0].instant).toBe(true);
      await project.addComment('parts', 1, { pin, text: '', effect: 'big-word' });
      await project.addComment('parts', 1, { pin, text: 'A close-up of the cup', insertShot: true });
      const batch = await project.copyBatch('parts', 1);
      expect(batch.count).toBe(2);
      const saved = JSON.parse(await readFile(join(dir, batch.file), 'utf8'));
      expect(saved.comments).toEqual(expect.arrayContaining([
        expect.objectContaining({ effect: 'big-word', text: '' }),
        expect.objectContaining({ insertShot: true, text: 'A close-up of the cup' }),
      ]));
      expect(batch.text).toContain('Effect: big-word');
      expect(batch.text).toContain('Insert shot after');
      expect(JSON.stringify(saved)).not.toContain('effectHtml');
    } finally { await project.close(); }
  });
  it('pins the shown alternate without selecting it, and preserves deletion undo through freeze', async () => {
    const { dir, reelDir } = alternatesFixture(); const project = openProject(dir);
    try {
      await project.buildParts('parts');
      const result = await project.addComment('parts', 1, { pin: { ...pin, shot: '02', alternate: 'r2' }, text: '', effect: 'title-card' });
      expect((await project.readWorkingVersion('parts')).workingParts?.shots[1].revision).toBe('r1');
      expect(await project.workingPartsPage('parts')).not.toContain('data-pinned-effect');
      expect(await project.workingPartsPage('parts', { shot: 'proof', revision: 'r2' })).toContain('data-pinned-effect');
      const frozen = await project.freezeEdits('parts');
      expect(await readFile(join(reelDir, `v${frozen.version}`, 'index.html'), 'utf8')).not.toContain('data-pinned-effect');
      await project.deleteComment('parts', frozen.version, result.comment.id);
      expect(await project.listComments('parts', frozen.version)).toEqual([]);
      await project.undoEdit('parts');
      expect((await project.listComments('parts', frozen.version))[0].pin).toMatchObject({ alternate: 'r2' });
    } finally { await project.close(); }
  });
  it('offers built effect notes once, keeps accepted rules in this reel only, and never offers inserted shots', async () => {
    const { dir } = partsFixture(3, false); const project = openProject(dir);
    try {
      await project.buildParts('parts');
      await project.copyStyleToReel('parts', { id: 'clean' });
      await project.addComment('parts', 1, { pin, effect: 'title-card', text: 'Keep captions low' });
      await project.addComment('parts', 1, { pin, insertShot: true, text: 'A shot of the door' });
      expect(await project.builtPinNotes('parts')).toEqual([]);
      await project.copyBatch('parts', 1);
      await project.buildParts('parts', 'Test agent');
      const notes = await project.builtPinNotes('parts');
      expect(notes).toHaveLength(1); expect(notes[0].text).toBe('Keep captions low');
      await project.decidePinNote('parts', notes[0].id, true);
      expect((await project.readReelStyle('parts'))?.rules).toEqual(['Keep captions low']);
      expect((await project.listStyles()).styles.find((style) => style.id === 'clean')?.rules).toEqual([]);
      expect(await project.builtPinNotes('parts')).toEqual([]);
    } finally { await project.close(); }
  });
  it('dismisses a note explicitly or by ignoring it through the next Build, without changing style rules', async () => {
    const { dir } = partsFixture(3, false); const project = openProject(dir);
    try {
      await project.buildParts('parts'); await project.copyStyleToReel('parts', { id: 'clean' });
      await project.addComment('parts', 1, { pin, effect: 'big-word', text: 'Make it quiet' });
      await project.copyBatch('parts', 1); await project.buildParts('parts', 'Test agent');
      const first = (await project.builtPinNotes('parts'))[0]; await project.decidePinNote('parts', first.id, false);
      expect(await project.builtPinNotes('parts')).toEqual([]);
      let number = (await project.readWorkingVersion('parts')).number;
      await project.addComment('parts', number, { pin, effect: 'big-word', text: 'Try a smaller word' });
      await project.copyBatch('parts', number); await project.buildParts('parts', 'Test agent');
      expect(await project.builtPinNotes('parts')).toHaveLength(1);
      number = (await project.readWorkingVersion('parts')).number;
      await project.addComment('parts', number, { pin, insertShot: true, text: 'A wide shot' });
      await project.copyBatch('parts', number);
      expect(await project.builtPinNotes('parts')).toEqual([]);
      await project.buildParts('parts', 'Test agent');
      expect(await project.builtPinNotes('parts')).toEqual([]);
      expect((await project.readReelStyle('parts'))?.rules).toEqual([]);
    } finally { await project.close(); }
  });
});
