import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { openProject } from '../../server/core/index.ts';
import { copyFixture, emptyProject } from '../helpers/project.ts';

const REEL = 'working';
const TIMEOUT_MS = 120_000;
const move = (x: number) => ({ kind: 'element-offset' as const, clip: 'box', element: 'square', x, y: 0, scale: 1 });
function setup() {
  const dir = emptyProject();
  const reelDir = join(dir, 'reels', REEL);
  mkdirSync(join(reelDir, 'v1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Working render' }));
  writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: 0.2, shots: [{ number: '01', scene: 'box', start: 0, title: 'Box', description: 'A square' }] }));
  writeFileSync(join(reelDir, 'v1', 'index.html'), '<!doctype html><html><head><style>html,body{margin:0;background:#fff}[data-scene]{position:absolute;inset:0}[data-el]{width:30px;height:30px;background:#000}</style></head><body><section data-scene="box" data-start="0" data-duration="0.2"><div data-el="square"></div></section><script>window.DURATION=0.2;window.seek=function(t){};</script></body></html>');
  return { dir, reelDir, project: openProject(dir, { renderSegments: 1 }) };
}
const captures = (dir: string) => readdirSync(dir).filter((name) => name.startsWith('.draft-'));

describe('working renders', () => {
  it('removes stale Draft captures at server startup without letting read-only project access delete captures', async () => {
    const dir = emptyProject();
    const reelDir = join(dir, 'reels', REEL);
    mkdirSync(join(reelDir, '.draft-stale', 'nested'), { recursive: true });
    mkdirSync(join(reelDir, 'v1'), { recursive: true });
    writeFileSync(join(reelDir, '.draft-stale', 'nested', 'input'), 'interrupted');
    openProject(dir);
    expect(captures(reelDir)).toEqual(['.draft-stale']);
    const server = await startServer({ projectDir: dir, port: 0 });
    try {
      expect(captures(reelDir)).toEqual([]);
      expect(existsSync(join(reelDir, 'v1'))).toBe(true);
      mkdirSync(join(reelDir, '.draft-active'));
      openProject(dir);
      expect(captures(reelDir)).toEqual(['.draft-active']);
    } finally { await server.close(); }
  });

  it.each(['legacy', 'native'])('captures a %s footage Draft without copying the footage', { timeout: TIMEOUT_MS }, async (kind) => {
    const dir = copyFixture('footage-project');
    const reelDir = join(dir, 'reels', 'founder-talk');
    if (kind === 'native') writeFileSync(join(reelDir, 'plan.json'), JSON.stringify({ duration: 12, clips: [], media: { schema: 1, sources: [{ id: 'video', kind: 'video', path: '../../media/talk.mp4', duration: 12, audio: false }], placements: [{ id: 'main', role: 'main', source: 'video', in: 0, out: 12 }], sequence: ['main'] } }));
    const project = openProject(dir, { renderSegments: 1 });
    const job = await project.renderWorking({ reel: 'founder-talk', preset: 'draft' });
    try {
      const [capture] = captures(reelDir);
      const files = readdirSync(join(reelDir, capture!), { recursive: true }).map(String);
      expect(files.filter((file) => /\.mp4$/i.test(file))).toEqual([]);
      const plan = JSON.parse(readFileSync(join(reelDir, capture!, 'plan.json'), 'utf8'));
      expect(kind === 'legacy' ? plan.video : plan.media.sources[0].path).toBe('../../../media/talk.mp4');
    } finally { await project.cancelRender(job.id); }
  });

  it('captures a Draft at request time without freezing and removes inputs on completion', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move(10));
    const job = await project.renderWorking({ reel: REEL, preset: 'draft' });
    expect(job).toMatchObject({ working: true, version: 1 });
    const [capture] = captures(reelDir);
    expect(readFileSync(join(reelDir, capture!, 'kinotta-edits.css'), 'utf8')).toContain('10px');
    await project.addOperation(REEL, move(20));
    expect(readFileSync(join(reelDir, capture!, 'kinotta-edits.css'), 'utf8')).not.toContain('20px');
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    expect((await project.whenRendered(job.id)).state).toBe('done');
    expect(captures(reelDir)).toEqual([]);
    expect((await project.listRenders(REEL))[0]).toMatchObject({ working: true, preset: 'draft' });
  });

  it('removes a captured Draft when it is cancelled while queued', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    const first = await project.render({ reel: REEL, version: 1, preset: 'draft' });
    const second = await project.renderWorking({ reel: REEL, preset: 'draft' });
    expect((await project.cancelRender(second.id)).state).toBe('cancelled');
    expect(captures(reelDir)).toEqual([]);
    await project.cancelRender(first.id);
  });

  it('removes a captured Draft after a rendering failure', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    const page = join(reelDir, 'v1', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace('function(t){}', 'function(t){throw new Error("broken seek")}'));
    const job = await project.renderWorking({ reel: REEL, preset: 'draft' });
    expect((await project.whenRendered(job.id)).state).toBe('failed');
    expect(captures(reelDir)).toEqual([]);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
  });

  it('freezes a Final through the boundary, reuses unchanged content and keeps explicit older renders unchanged', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move(10));
    const first = await project.renderWorking({ reel: REEL, preset: 'final' });
    expect(first.version).toBe(2);
    await project.cancelRender(first.id);
    const repeated = await project.renderWorking({ reel: REEL, preset: 'final' });
    expect(repeated.version).toBe(2);
    await project.cancelRender(repeated.id);
    const old = await project.render({ reel: REEL, version: 1, preset: 'draft' });
    expect(old).toMatchObject({ version: 1 });
    expect(old.working).toBeUndefined();
    await project.cancelRender(old.id);
    expect(existsSync(join(reelDir, 'v3'))).toBe(false);
    expect((await project.readEditList(REEL)).canUndo).toBe(true);
  });

  it('checks settings and the Overlay transparency gate before publishing', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    await project.addOperation(REEL, move(10));
    await expect(project.renderWorking({ reel: REEL, preset: 'overlay' })).rejects.toThrow('transparent');
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
    expect(project.renderJobs()).toEqual([]);
  });
  it('removes a Draft capture when its running render is cancelled', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    const job = await project.renderWorking({ reel: REEL, preset: 'draft' });
    await expect.poll(() => project.renderJobs().find((item) => item.id === job.id)?.state).toBe('running');
    expect((await project.cancelRender(job.id)).state).toBe('cancelled');
    expect(captures(reelDir)).toEqual([]);
    expect(existsSync(join(reelDir, 'v2'))).toBe(false);
  });

  it('freezes transparent Working for Overlay and reuses it when unchanged', { timeout: TIMEOUT_MS }, async () => {
    const { reelDir, project } = setup();
    const page = join(reelDir, 'v1', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace('<html>', '<html class="alpha">').replace('background:#fff', 'background:transparent'));
    await project.addOperation(REEL, move(10));
    const job = await project.renderWorking({ reel: REEL, preset: 'overlay' });
    expect(job.version).toBe(2);
    expect((await project.readVersion(REEL, 2)).frozenBy).toBe('Overlay render');
    await project.cancelRender(job.id);
    const repeated = await project.renderWorking({ reel: REEL, preset: 'overlay' });
    expect(repeated.version).toBe(2);
    await project.cancelRender(repeated.id);
    expect(existsSync(join(reelDir, 'v3'))).toBe(false);
    expect((await project.readEditList(REEL)).canUndo).toBe(true);
  });

});
