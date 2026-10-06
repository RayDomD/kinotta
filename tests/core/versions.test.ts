import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { ProjectEvent } from '../../server/core/index.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const PIN = { shot: '03', x: 0.5, y: 0.5, element: null };
const EVENT_WAIT_MS = 4000;
const QUIET_MS = 700;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Collects events, and resolves `next(type)` with the first not-yet-taken event of that type. */
function listen(project: ReturnType<typeof openProject>) {
  const events: ProjectEvent[] = [];
  const unsubscribe = project.subscribe((event) => events.push(event));
  const next = async (type: ProjectEvent['type']): Promise<ProjectEvent> => {
    const deadline = Date.now() + EVENT_WAIT_MS;
    while (Date.now() < deadline) {
      const found = events.find((e) => e.type === type);
      if (found) return found;
      await sleep(25);
    }
    throw new Error(`No ${type} event within ${EVENT_WAIT_MS} ms. Saw ${JSON.stringify(events)}`);
  };
  return { events, unsubscribe, next };
}

/** A new version folder the way an agent writes one: page first, shots.json last. */
function addVersion(dir: string, from: number, to: number): void {
  const source = join(dir, 'reels', REEL, `v${from}`);
  const target = join(dir, 'reels', REEL, `v${to}`);
  mkdirSync(target);
  cpSync(join(source, 'index.html'), join(target, 'index.html'));
  cpSync(join(source, 'shots.json'), join(target, 'shots.json'));
}

describe('versions', () => {
  it('lists a reel versions in order, marking the newest and the storyboard', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect(await project.listVersions(REEL)).toEqual([
      { number: 1, isNewest: false, isStoryboard: true, approved: false, comments: 0, issues: 0 },
      { number: 2, isNewest: true, isStoryboard: false, approved: false, comments: 0, issues: 0 },
    ]);
  });

  it('moves the newest mark when a version folder appears', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    addVersion(dir, 2, 3);

    expect((await project.listVersions(REEL)).map((v) => [v.number, v.isNewest])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect((await project.readVersion(REEL, 2)).isNewest).toBe(false);
    expect((await project.readVersion(REEL, 3)).isNewest).toBe(true);
  });

  it('refuses versions of an unknown reel', async () => {
    await expect(openProject(copyFixture('showreel-project')).listVersions('nope')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('frozen versions', () => {
  it('refuses a comment on a version that is not the newest, naming the newest', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);

    await expect(project.addComment(REEL, 1, { pin: PIN, text: 'Too late.' })).rejects.toMatchObject({
      name: 'KinottaError',
      code: 'frozen',
      message: 'v1 is frozen. Only the newest version, v2, takes comments.',
    });
    expect(existsSync(join(dir, 'reels', '.kinotta', REEL, 'v1.json'))).toBe(false);
    expect(await project.listComments(REEL, 1)).toEqual([]);
  });

  it('refuses to copy the batch of a version that is not the newest, and writes nothing', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment(REEL, 2, { pin: PIN, text: 'Fine while v2 is newest.' });
    const stateV2 = join(dir, 'reels', '.kinotta', REEL, 'v2.json');
    cpSync(stateV2, join(dir, 'reels', '.kinotta', REEL, 'v1.json'));

    await expect(project.copyBatch(REEL, 1)).rejects.toMatchObject({ code: 'frozen' });
    expect(existsSync(join(dir, 'reels', REEL, 'v1', 'comments.json'))).toBe(false);
  });

  it('freezes a version the moment a newer one appears', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    await project.addComment(REEL, 2, { pin: PIN, text: 'Before v3.' });
    addVersion(dir, 2, 3);

    await expect(project.addComment(REEL, 2, { pin: PIN, text: 'After v3.' })).rejects.toMatchObject({ code: 'frozen' });
    await expect(project.copyBatch(REEL, 2)).rejects.toMatchObject({ code: 'frozen' });
    expect((await project.addComment(REEL, 3, { pin: PIN, text: 'On v3.' })).comment.text).toBe('On v3.');
    expect((await project.listComments(REEL, 2)).map((c) => c.text)).toEqual(['Before v3.']);
  });

  it('still reads a frozen version and its comments', async () => {
    const project = openProject(copyFixture('showreel-project'));

    expect((await project.readVersion(REEL, 1)).isNewest).toBe(false);
    expect(await project.listComments(REEL, 1)).toEqual([]);
  });
});

describe('subscribe', () => {
  it('emits one version-added when a version folder with shots.json appears', async () => {
    const dir = copyFixture('showreel-project');
    const { events, unsubscribe, next } = listen(openProject(dir));
    try {
      addVersion(dir, 2, 3);

      expect(await next('version-added')).toEqual({ type: 'version-added', reel: REEL, version: 3 });
      await sleep(QUIET_MS);
      expect(events.filter((e) => e.type === 'version-added')).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });

  it('waits for shots.json before announcing a version', async () => {
    const dir = copyFixture('showreel-project');
    const { events, unsubscribe, next } = listen(openProject(dir));
    try {
      const target = join(dir, 'reels', REEL, 'v3');
      mkdirSync(target);
      writeFileSync(join(target, 'index.html'), '<html></html>');
      await sleep(QUIET_MS);
      expect(events.filter((e) => e.type === 'version-added')).toEqual([]);

      cpSync(join(dir, 'reels', REEL, 'v2', 'shots.json'), join(target, 'shots.json'));

      expect(await next('version-added')).toEqual({ type: 'version-added', reel: REEL, version: 3 });
    } finally {
      unsubscribe();
    }
  });

  it('emits comments-changed when a comment is saved', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const { events, unsubscribe, next } = listen(project);
    try {
      await project.addComment(REEL, 2, { pin: PIN, text: 'Hold it.' });

      expect(await next('comments-changed')).toEqual({ type: 'comments-changed', reel: REEL, version: 2 });
      await sleep(QUIET_MS);
      expect(events.filter((e) => e.type === 'comments-changed')).toHaveLength(1);
      expect(events.filter((e) => e.type === 'version-added')).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it('emits reels-changed when a reel folder appears', async () => {
    const dir = copyFixture('showreel-project');
    const { unsubscribe, next } = listen(openProject(dir));
    try {
      mkdirSync(join(dir, 'reels', 'new-reel'));

      expect(await next('reels-changed')).toEqual({ type: 'reels-changed' });
    } finally {
      unsubscribe();
    }
  });

  it('stops emitting after unsubscribe, and other subscribers keep hearing', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    const gone = listen(project);
    const kept = listen(project);
    try {
      gone.unsubscribe();
      addVersion(dir, 2, 3);

      await kept.next('version-added');
      expect(gone.events).toEqual([]);
    } finally {
      kept.unsubscribe();
    }
  });

  it('watches again after every subscriber has left', async () => {
    const dir = copyFixture('showreel-project');
    const project = openProject(dir);
    listen(project).unsubscribe();
    const again = listen(project);
    try {
      addVersion(dir, 2, 3);

      expect(await again.next('version-added')).toMatchObject({ version: 3 });
    } finally {
      again.unsubscribe();
    }
  });
});
