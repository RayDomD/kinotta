import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import { startServer, type RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const REEL = 'product-showreel';
const PIN = { shot: '01', x: 0.3, y: 0.4, element: null };

/** The showreel sample with three files in its renders folder, an older Draft, a newer Final and a temp file. */
function withRenders(): string {
  const dir = copyFixture('showreel-project');
  const renders = join(dir, 'reels', REEL, 'renders');
  mkdirSync(join(renders, '.work-abc'), { recursive: true });
  writeFileSync(join(renders, `${REEL}-v1-draft-540p30.mp4`), 'draft bytes');
  writeFileSync(join(renders, `${REEL}-v2-final-1080p30-high.mp4`), '0123456789');
  writeFileSync(join(renders, '.render-abc.mp4'), 'partial');
  utimesSync(join(renders, `${REEL}-v1-draft-540p30.mp4`), new Date('2026-10-01T10:00:00Z'), new Date('2026-10-01T10:00:00Z'));
  utimesSync(join(renders, `${REEL}-v2-final-1080p30-high.mp4`), new Date('2026-10-02T10:00:00Z'), new Date('2026-10-02T10:00:00Z'));
  return dir;
}

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
});

async function serve(dir: string): Promise<string> {
  const server = await startServer({ projectDir: dir, port: 0 });
  running.push(server);
  return server.url;
}

describe('the version listing for Picker', () => {
  it('counts each version\'s comments and contract issues', async () => {
    const project = openProject(copyFixture('showreel-project'));
    await project.addComment(REEL, 2, { pin: PIN, text: 'Darker.' });
    await project.addComment(REEL, 2, { pin: PIN, text: 'Slower.' });

    const entries = await project.listVersions(REEL);

    expect(entries.map((e) => [e.number, e.comments, e.issues])).toEqual([
      [1, 0, 0],
      [2, 2, 0],
    ]);
  });

  it('counts the issues the render gate refuses on', async () => {
    const project = openProject(copyFixture('broken-project'));

    const [first] = await project.listVersions('launch-teaser');

    expect(first!.issues).toBeGreaterThan(0);
  });
});

describe('past renders', () => {
  it('lists the finished renders newest first, with the version and preset from the name, and skips temp files', async () => {
    const project = openProject(withRenders());

    const renders = await project.listRenders(REEL);

    expect(renders).toEqual([
      { file: `${REEL}-v2-final-1080p30-high.mp4`, version: 2, preset: 'final', bytes: 10, at: '2026-10-02T10:00:00.000Z' },
      { file: `${REEL}-v1-draft-540p30.mp4`, version: 1, preset: 'draft', bytes: 11, at: '2026-10-01T10:00:00.000Z' },
    ]);
  });

  it('lists none for a reel that has never rendered, and refuses an unknown reel', async () => {
    const project = openProject(copyFixture('showreel-project'));

    await expect(project.listRenders(REEL)).resolves.toEqual([]);
    await expect(project.listRenders('nope')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('serves the list and the files, with byte ranges, and nothing outside the renders folder', async () => {
    const url = await serve(withRenders());

    const listed = (await (await fetch(`${url}/api/reels/${REEL}/renders`)).json()) as { renders: Array<{ file: string }> };
    const whole = await fetch(`${url}/renders/${REEL}/${REEL}-v2-final-1080p30-high.mp4`);
    const part = await fetch(`${url}/renders/${REEL}/${REEL}-v2-final-1080p30-high.mp4`, { headers: { range: 'bytes=2-4' } });

    expect(listed.renders.map((r) => r.file)).toEqual([`${REEL}-v2-final-1080p30-high.mp4`, `${REEL}-v1-draft-540p30.mp4`]);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    expect(await whole.text()).toBe('0123456789');
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('234');
    for (const path of [`/renders/${REEL}/.render-abc.mp4`, `/renders/${REEL}/..%2Freel.json`, `/renders/${REEL}/missing.mp4`, '/renders/nope/x.mp4']) {
      expect((await fetch(url + path)).status).toBe(404);
    }
  });

  it('refuses to show an unknown render in the folder', async () => {
    const dir = withRenders();
    const url = await serve(dir);

    await expect(openProject(dir).revealRender(REEL, 'missing.mp4')).rejects.toMatchObject({ code: 'not-found' });
    expect((await fetch(`${url}/api/reels/${REEL}/renders/.render-abc.mp4/reveal`, { method: 'POST' })).status).toBe(404);
  });
});
