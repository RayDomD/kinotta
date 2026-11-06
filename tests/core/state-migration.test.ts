import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { migrateReelState } from '../../server/core/_internal/state-migration.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const COMMENT = { id: 'c1', pin: { kind: 'frame', version: 2, section: null, shot: '03', time: 3.6, x: 0.5, y: 0.5, element: null }, text: 'Hold ICONS.', createdAt: '2026-11-01T00:00:00.000Z' };
const state = (text: string): string => `${JSON.stringify({ comments: [{ ...COMMENT, text }], note: `note ${text}` })}\n`;

const oldDir = (dir: string, slug = REEL): string => join(dir, 'reels', '.kinotta', slug);
const newDir = (dir: string, slug = REEL): string => join(dir, 'reels', slug, '.kinotta');
function put(folder: string, name: string, text: string): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), text);
}

describe('reel state migration', () => {
  it('reads comments, note, markers and style from the reel folder after opening an old-layout project', async () => {
    const dir = copyFixture('showreel-project');
    put(oldDir(dir), 'v2.json', state('old'));
    put(oldDir(dir), 'markers.json', JSON.stringify([{ id: 'm1', time: 1, name: 'Intro' }]));
    put(oldDir(dir), 'style.json', '{"rules":["keep"]}');

    const project = openProject(dir);

    expect((await project.listComments(REEL, 2)).map((c) => c.text)).toEqual(['old']);
    expect(await project.listMarkers(REEL)).toEqual([{ id: 'm1', time: 1, name: 'Intro' }]);
    expect(readFileSync(join(newDir(dir), 'style.json'), 'utf8')).toBe('{"rules":["keep"]}');
    expect(existsSync(oldDir(dir))).toBe(false);
  });

  it('keeps the reel-folder copy when both exist and sets the other aside as a reported conflict', () => {
    const dir = copyFixture('showreel-project');
    put(newDir(dir), 'v2.json', state('new'));
    put(oldDir(dir), 'v2.json', state('old'));

    const report = migrateReelState(dir);

    expect(readFileSync(join(newDir(dir), 'v2.json'), 'utf8')).toBe(state('new'));
    const aside = readdirSync(newDir(dir)).filter((n) => n.startsWith('v2.json.conflict-'));
    expect(aside).toHaveLength(1);
    expect(readFileSync(join(newDir(dir), aside[0]!), 'utf8')).toBe(state('old'));
    expect(existsSync(join(oldDir(dir), 'v2.json'))).toBe(false);
    expect(report.conflicts).toEqual([join(newDir(dir), aside[0]!)]);
  });

  it('finishes after a crash between copy and remove without losing anything or reporting a conflict', () => {
    const dir = copyFixture('showreel-project');
    put(oldDir(dir), 'v2.json', state('same'));
    put(newDir(dir), 'v2.json', state('same'));

    const report = migrateReelState(dir);

    expect(readFileSync(join(newDir(dir), 'v2.json'), 'utf8')).toBe(state('same'));
    expect(existsSync(oldDir(dir))).toBe(false);
    expect(report.conflicts).toEqual([]);
  });

  it('ignores a half-written temp file left in the reel folder and still migrates', () => {
    const dir = copyFixture('showreel-project');
    put(oldDir(dir), 'v2.json', state('old'));
    put(newDir(dir), 'v2.json.abc.tmp', '{"comm');

    migrateReelState(dir);

    expect(readFileSync(join(newDir(dir), 'v2.json'), 'utf8')).toBe(state('old'));
    expect(existsSync(oldDir(dir))).toBe(false);
  });

  it('leaves state for a slug with no reel folder where it is and reports it', () => {
    const dir = copyFixture('showreel-project');
    put(oldDir(dir, 'gone'), 'v1.json', state('orphan'));

    const report = migrateReelState(dir);

    expect(readFileSync(join(oldDir(dir, 'gone'), 'v1.json'), 'utf8')).toBe(state('orphan'));
    expect(existsSync(join(dir, 'reels', 'gone'))).toBe(false);
    expect(report.orphans).toEqual(['gone']);
  });

  it('does not touch the project-level effects box and stills', () => {
    const dir = copyFixture('showreel-project');
    put(join(dir, 'reels', '.kinotta'), 'effects-box.json', '["big-word"]');
    put(join(dir, 'reels', '.kinotta', 'stills', 'abc'), '1-160.jpg', 'jpg');
    put(oldDir(dir), 'v2.json', state('old'));

    migrateReelState(dir);

    expect(readFileSync(join(dir, 'reels', '.kinotta', 'effects-box.json'), 'utf8')).toBe('["big-word"]');
    expect(readFileSync(join(dir, 'reels', '.kinotta', 'stills', 'abc', '1-160.jpg'), 'utf8')).toBe('jpg');
    expect(existsSync(oldDir(dir))).toBe(false);
  });

  it('saving a comment emits no version event and does emit a comments event', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const events: string[] = [];
    const stop = project.subscribe((event) => events.push(event.type));

    await project.addComment(REEL, 2, { pin: { shot: '03', x: 0.5, y: 0.5, element: null }, text: 'Hold.' });
    await new Promise((done) => setTimeout(done, 700));
    stop();

    expect(events).toContain('comments-changed');
    expect(events).not.toContain('version-added');
    expect(events).not.toContain('reels-changed');
  });
});
