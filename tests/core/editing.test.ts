import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const EARLY = { shot: '03', x: 0.5, y: 0.6, element: 'icons-word' };
const LATE = { shot: '06', x: 0.52, y: 0.61, element: null };

function stateFile(dir: string, version = 2): string {
  return join(dir, 'reels', '.kinotta', REEL, `v${version}.json`);
}

async function withThree() {
  const dir = copyFixture('showreel-project');
  const project = openProject(dir);
  const late = await project.addComment(REEL, 2, { pin: LATE, text: 'Use the real logo.' });
  const early = await project.addComment(REEL, 2, { pin: EARLY, text: 'Hold ICONS.' });
  const middle = await project.addComment(REEL, 2, { pin: { ...EARLY, shot: '04', element: null }, text: 'Too empty.' });
  return { dir, project, late: late.comment, early: early.comment, middle: middle.comment };
}

describe('editComment', () => {
  it('changes the text, keeps the pin and number, and persists', async () => {
    const { dir, project, early, middle } = await withThree();

    const edited = await project.editComment(REEL, 2, middle.id, '  Fill the empty corner.  ');

    expect(edited.comment).toMatchObject({ id: middle.id, number: 2, text: 'Fill the empty corner.', pin: middle.pin });
    expect(edited.comments.map((c) => [c.number, c.text])).toEqual([
      [1, early.text],
      [2, 'Fill the empty corner.'],
      [3, 'Use the real logo.'],
    ]);
    expect((await openProject(dir).listComments(REEL, 2)).find((c) => c.id === middle.id)!.text).toBe('Fill the empty corner.');
    const saved = JSON.parse(readFileSync(stateFile(dir), 'utf8')) as { comments: Array<{ id: string; text: string }> };
    expect(saved.comments.find((c) => c.id === middle.id)!.text).toBe('Fill the empty corner.');
  });

  it('refuses empty text and leaves the comment as it was', async () => {
    const { project, early } = await withThree();

    await expect(project.editComment(REEL, 2, early.id, '   ')).rejects.toMatchObject({ code: 'invalid' });
    expect((await project.listComments(REEL, 2)).find((c) => c.id === early.id)!.text).toBe('Hold ICONS.');
  });

  it('refuses an unknown comment id', async () => {
    const { project } = await withThree();

    await expect(project.editComment(REEL, 2, 'nope', 'Text')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('deleteComment', () => {
  it('removes the comment and renumbers the rest with no gaps', async () => {
    const { dir, project, early, middle, late } = await withThree();

    const { comments } = await project.deleteComment(REEL, 2, early.id);

    expect(comments.map((c) => [c.number, c.id])).toEqual([
      [1, middle.id],
      [2, late.id],
    ]);
    expect((await openProject(dir).listComments(REEL, 2)).map((c) => c.number)).toEqual([1, 2]);
    expect(readFileSync(stateFile(dir), 'utf8')).not.toContain(early.id);
  });

  it('keeps the note when the last comment goes', async () => {
    const { dir, project, early } = await withThree();
    await project.setNote(REEL, 2, 'Overall: slower.');
    for (const c of await project.listComments(REEL, 2)) await project.deleteComment(REEL, 2, c.id);

    expect(await project.listComments(REEL, 2)).toEqual([]);
    expect(await project.readNote(REEL, 2)).toBe('Overall: slower.');
    expect(early.id).toBeTruthy();
    expect(existsSync(stateFile(dir))).toBe(true);
  });

  it('refuses an unknown comment id and changes nothing', async () => {
    const { project } = await withThree();

    await expect(project.deleteComment(REEL, 2, 'nope')).rejects.toMatchObject({ code: 'not-found' });
    expect(await project.listComments(REEL, 2)).toHaveLength(3);
  });
});

describe('the note on the whole reel', () => {
  it('starts empty, saves trimmed, and clears with an empty string', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect(await project.readNote(REEL, 2)).toBe('');
    expect((await project.setNote(REEL, 2, '  Slow the whole thing down.\n')).note).toBe('Slow the whole thing down.');
    expect(await project.readNote(REEL, 2)).toBe('Slow the whole thing down.');
    expect((await project.setNote(REEL, 2, '')).note).toBe('');
    expect(await project.readNote(REEL, 2)).toBe('');
  });

  it('leaves the comments alone', async () => {
    const { project } = await withThree();

    const saved = await project.setNote(REEL, 2, 'A note.');

    expect(saved.comments.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(await project.listComments(REEL, 2)).toHaveLength(3);
  });

  it('refuses a note that is too long', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await expect(project.setNote(REEL, 2, 'x'.repeat(4001))).rejects.toMatchObject({ code: 'invalid' });
    expect(await project.readNote(REEL, 2)).toBe('');
  });

  it('goes into the batch file and the pasteable text as the Notes block', async () => {
    const { dir, project } = await withThree();
    await project.setNote(REEL, 2, 'Overall: slower.');

    const copied = await project.copyBatch(REEL, 2);

    expect(copied.text).toContain('Notes\n- Overall: slower.');
    const batch = JSON.parse(readFileSync(join(dir, copied.file), 'utf8')) as { notes: string[] };
    expect(batch.notes).toEqual(['Overall: slower.']);
  });

  it('can be copied on its own, with no comments', async () => {
    const project = openProject(copyFixture('showreel-project'));
    await project.setNote(REEL, 2, 'Feedback for no single moment.');

    const copied = await project.copyBatch(REEL, 2);

    expect(copied.count).toBe(0);
    expect(copied.text).toContain('Notes\n- Feedback for no single moment.');
  });
});

describe('editing a frozen version', () => {
  it('refuses edit, delete, note and reads nothing changed', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const { comment } = await project.addComment(REEL, 2, { pin: EARLY, text: 'On v2.' });
    // Make the same comment exist on v1, which is not the newest.
    cpSync(stateFile(dir), stateFile(dir, 1));
    const before = readFileSync(stateFile(dir, 1), 'utf8');

    await expect(project.editComment(REEL, 1, comment.id, 'Changed')).rejects.toMatchObject({ code: 'frozen' });
    await expect(project.deleteComment(REEL, 1, comment.id)).rejects.toMatchObject({ code: 'frozen' });
    await expect(project.setNote(REEL, 1, 'A note')).rejects.toMatchObject({ code: 'frozen' });
    const after = JSON.parse(readFileSync(stateFile(dir, 1), 'utf8')) as { comments: unknown; note: string };
    expect({ comments: after.comments, note: after.note }).toEqual({ comments: JSON.parse(before).comments, note: JSON.parse(before).note });
  });
});
