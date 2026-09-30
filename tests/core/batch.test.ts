import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KinottaError, openProject } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const BATCH_PATH = 'reels/product-showreel/v2/comments.json';

function stateFile(dir: string): string {
  return join(dir, 'reels', '.kinotta', REEL, 'v2.json');
}

async function withTwoComments() {
  const dir = copyFixture('showreel-project');
  const project = openProject(dir);
  await project.addComment(REEL, 2, {
    pin: { shot: '06', x: 0.52, y: 0.61, element: null },
    text: 'Use the real logo bottom right.',
  });
  await project.addComment(REEL, 2, {
    pin: { shot: '03', x: 0.5, y: 0.6, element: 'icons-word' },
    text: 'Hold ICONS a beat longer before the cut.',
  });
  return { dir, project };
}

describe('copyBatch', () => {
  it('writes the batch file into the version folder, matching the comments', async () => {
    const { dir, project } = await withTwoComments();

    const result = await project.copyBatch(REEL, 2);

    expect(result.file).toBe(BATCH_PATH);
    expect(result.count).toBe(2);
    const saved = JSON.parse(readFileSync(join(dir, BATCH_PATH), 'utf8'));
    expect(saved).toMatchObject({
      reel: REEL,
      title: 'Product showreel',
      version: 2,
      section: null,
      comments: [
        { number: 1, shot: '03', time: 3.6, element: 'icons-word', x: 0.5, y: 0.6, text: 'Hold ICONS a beat longer before the cut.' },
        { number: 2, shot: '06', time: 12.2, element: null, x: 0.52, y: 0.61, text: 'Use the real logo bottom right.' },
      ],
      notes: [],
    });
    expect(Number.isNaN(Date.parse(saved.copiedAt))).toBe(false);
    expect(readdirSync(join(dir, 'reels', REEL, 'v2')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('builds pasteable text naming shot, time and element or position', async () => {
    const { project } = await withTwoComments();

    const { text } = await project.copyBatch(REEL, 2);

    expect(text).toBe(
      [
        'Kinotta comments: Product showreel, v2',
        `Saved as ${BATCH_PATH}`,
        '',
        '1. Shot 03, 03.60s, icons-word: Hold ICONS a beat longer before the cut.',
        '2. Shot 06, 12.20s, position 52% 61%: Use the real logo bottom right.',
        '',
      ].join('\n'),
    );
  });

  it('adds a Notes block only when the version has a note', async () => {
    const { dir, project } = await withTwoComments();
    const state = JSON.parse(readFileSync(stateFile(dir), 'utf8'));
    writeFileSync(stateFile(dir), JSON.stringify({ ...state, note: 'Keep it punchy.' }));

    const { text, count } = await project.copyBatch(REEL, 2);

    expect(count).toBe(2);
    expect(text).toContain('\nNotes\n- Keep it punchy.\n');
    expect(JSON.parse(readFileSync(join(dir, BATCH_PATH), 'utf8')).notes).toEqual(['Keep it punchy.']);
  });

  it('overwrites the batch file when copied again after a new comment', async () => {
    const { dir, project } = await withTwoComments();
    await project.copyBatch(REEL, 2);

    await project.addComment(REEL, 2, { pin: { shot: '03', x: 0.2, y: 0.3, element: null }, text: 'Third.' });
    const again = await project.copyBatch(REEL, 2);

    expect(again.count).toBe(3);
    expect(JSON.parse(readFileSync(join(dir, BATCH_PATH), 'utf8')).comments).toHaveLength(3);
  });

  it('refuses when there are no comments and no note, and writes nothing', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    await expect(project.copyBatch(REEL, 2)).rejects.toMatchObject({ code: 'invalid' });
    await expect(project.copyBatch(REEL, 2)).rejects.toBeInstanceOf(KinottaError);
    expect(existsSync(join(dir, BATCH_PATH))).toBe(false);
  });

  it('leaves the comments and note as they were, and only records the hand-off', async () => {
    const { dir, project } = await withTwoComments();
    const before = JSON.parse(readFileSync(stateFile(dir), 'utf8')) as { comments: Array<{ id: string }>; note: string };

    await project.copyBatch(REEL, 2);

    const after = JSON.parse(readFileSync(stateFile(dir), 'utf8')) as typeof before & { handedOff: Record<string, { commentIds: string[] }> };
    expect({ comments: after.comments, note: after.note }).toEqual(before);
    expect(after.handedOff.reel!.commentIds.sort()).toEqual(before.comments.map((c) => c.id).sort());
  });

  it('rejects an unknown version as not-found', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await expect(project.copyBatch(REEL, 9)).rejects.toMatchObject({ code: 'not-found' });
  });
});
