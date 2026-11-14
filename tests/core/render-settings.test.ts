import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../../server/core/index.ts';
import type { RenderRequest } from '../../server/core/index.ts';
import { startServer, type RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const TINY = 'tiny';
const SETTINGS_FILE = 'render-settings.json';
const RENDER_TIMEOUT_MS = 180_000;

/** A one-second code-only page drawn on a `#stage` of the given size, on a transparent background when `alpha`. */
function page(width: number, height: number, alpha = false): string {
  return `<!DOCTYPE html><html${alpha ? ' class="alpha"' : ''}><head><style>html,body{margin:0;background:${alpha ? 'transparent' : '#211b16'}}
#stage{position:relative;width:${width}px;height:${height}px;overflow:hidden}#box{position:absolute;top:40%;width:10%;height:10%;background:#e8741c}</style></head>
<body><div id="stage"><section data-scene="box" data-start="0" data-duration="1"><div id="box" data-el="box"></div></section></div><script>window.DURATION=1;window.seek=function(t){document.getElementById('box').style.left=(t*80)+'%';};seek(0);</script></body></html>`;
}

/** The showreel sample plus a code-only reel `tiny` whose approved v1 is a one-second page. */
function project(html = page(1920, 1080)): string {
  const dir = copyFixture('showreel-project');
  const reelDir = join(dir, 'reels', TINY);
  mkdirSync(join(reelDir, 'v1'), { recursive: true });
  writeFileSync(join(reelDir, 'reel.json'), JSON.stringify({ title: 'Tiny' }));
  writeFileSync(join(reelDir, 'v1', 'index.html'), html);
  writeFileSync(join(reelDir, 'v1', 'shots.json'), JSON.stringify({ contract: 1, duration: 1, shots: [{ number: '01', start: 0, title: 'Box', description: 'A box.' }] }));
  writeFileSync(join(reelDir, 'v1', 'approval.json'), JSON.stringify({ approvedBy: 'you', at: '2026-10-06T00:00:00.000Z' }));
  return dir;
}

function probe(file: string): { width: number; height: number; frames: number; rate: string; profile: string } {
  const run = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate,profile', '-of', 'json', file], { encoding: 'utf8' });
  const stream = (JSON.parse(run.stdout) as { streams: Array<{ width: number; height: number; nb_read_frames: string; r_frame_rate: string; profile: string }> }).streams[0]!;
  return { width: stream.width, height: stream.height, frames: Number(stream.nb_read_frames), rate: stream.r_frame_rate, profile: stream.profile };
}

const crfOf = (file: string): string | undefined => /crf=(\d+\.\d)/.exec(readFileSync(file).toString('latin1'))?.[1];

async function rendered(dir: string, request: Omit<RenderRequest, 'reel'>): Promise<string> {
  const proj = openProject(dir);
  const job = await proj.whenRendered((await proj.render({ reel: TINY, ...request })).id);
  expect(job.error).toBeUndefined();
  return join(dir, job.output!);
}

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
});

describe('presets and the four settings', () => {
  it("starts each preset from R2's defaults", async () => {
    const settings = await openProject(project()).renderSettings(TINY);

    expect(settings).toEqual({
      draft: { fps: 'source', size: 'half', quality: 'standard', audio: 'smooth' },
      final: { fps: 'source', size: 'source', quality: 'standard', audio: 'smooth' },
      overlay: { fps: 'source', size: 'source', quality: 'standard', audio: 'smooth' },
    });
  });

  it('renders at the frame rate asked for, and names the file by it', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const file = await rendered(project(), { version: 1, preset: 'draft', fps: 24 });

    expect(file).toMatch(/tiny-v1-draft-540p24\.mp4$/);
    expect(probe(file)).toMatchObject({ width: 960, height: 540, frames: 24, rate: '24/1' });
  });

  it('scales the page to 1080p and 4K', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project(page(960, 540));

    const hd = await rendered(dir, { version: 1, preset: 'draft', size: '1080p' });
    const uhd = await rendered(dir, { version: 1, preset: 'final', size: '4k' });

    expect(hd).toMatch(/tiny-v1-draft-1080p30\.mp4$/);
    expect(probe(hd)).toMatchObject({ width: 1920, height: 1080 });
    expect(uhd).toMatch(/tiny-v1-final-2160p30\.mp4$/);
    expect(probe(uhd)).toMatchObject({ width: 3840, height: 2160 });
  });

  it("keeps the source's aspect ratio: a vertical page at 1080p is 1080 wide", { timeout: RENDER_TIMEOUT_MS }, async () => {
    const file = await rendered(project(page(540, 960)), { version: 1, preset: 'draft', size: '1080p' });

    expect(probe(file)).toMatchObject({ width: 1080, height: 1920 });
    expect(file).toMatch(/tiny-v1-draft-1920p30\.mp4$/);
  });

  it('renders High quality to its own file, beside the Standard one', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();

    const standard = await rendered(dir, { version: 1, preset: 'draft' });
    const high = await rendered(dir, { version: 1, preset: 'draft', quality: 'high' });

    expect(high).toMatch(/tiny-v1-draft-540p30-high\.mp4$/);
    expect(crfOf(high)).toBe('20.0');
    expect(crfOf(standard)).toBe('28.0');
    expect(existsSync(standard)).toBe(true);
  });

  it('writes a High Overlay as ProRes 4444 XQ', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const file = await rendered(project(page(960, 540, true)), { version: 1, preset: 'overlay', quality: 'high' });

    expect(file).toMatch(/tiny-v1-overlay-540p30-high\.mov$/);
    // ffprobe names ProRes 4444 XQ "XQ".
    expect(probe(file).profile).toBe('XQ');
  });

  it('does not name a code-only render by its audio, which it has none of', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const file = await rendered(project(), { version: 1, preset: 'draft', audio: 'hard' });

    expect(file).toMatch(/tiny-v1-draft-540p30\.mp4$/);
  });

  it('refuses a setting it does not know', async () => {
    const proj = openProject(project());

    await expect(proj.render({ reel: TINY, version: 1, preset: 'draft', fps: 23 as 24 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(proj.render({ reel: TINY, version: 1, preset: 'draft', size: '8k' as '4k' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(proj.render({ reel: TINY, version: 1, preset: 'draft', quality: 'best' as 'high' })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('remembered settings', () => {
  it('saves the settings of a remembered render for its preset only, and the next render of that preset uses them', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir);

    await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft', fps: 24, quality: 'high', remember: true })).id);
    const settings = await proj.renderSettings(TINY);
    const next = await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft' })).id);

    expect(settings.draft).toEqual({ fps: 24, size: 'half', quality: 'high', audio: 'smooth' });
    expect(settings.final).toEqual({ fps: 'source', size: 'source', quality: 'standard', audio: 'smooth' });
    expect(next.output).toBe('reels/tiny/renders/tiny-v1-draft-540p24-high.mp4');
  });

  it('does not save the settings of a render that is not remembered', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const proj = openProject(dir);

    await proj.whenRendered((await proj.render({ reel: TINY, version: 1, preset: 'draft', fps: 24 })).id);

    expect(existsSync(join(dir, 'reels', TINY, SETTINGS_FILE))).toBe(false);
  });

  it('saves from the HTTP render call and returns them from GET render-settings', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const server = await startServer({ projectDir: dir, port: 0 });
    running.push(server);

    const res = await fetch(`${server.url}/api/renders`, { method: 'POST', body: JSON.stringify({ reel: TINY, version: 1, preset: 'final', size: '1080p', fps: 25, remember: true }) });
    await server.project.whenRendered(((await res.json()) as { id: string }).id);
    const got = (await (await fetch(`${server.url}/api/reels/${TINY}/render-settings`)).json()) as { settings: Record<string, unknown> };
    const bad = await fetch(`${server.url}/api/renders`, { method: 'POST', body: JSON.stringify({ reel: TINY, version: 1, preset: 'final', size: 7 }) });

    expect(res.status).toBe(201);
    expect(got.settings.final).toEqual({ fps: 25, size: '1080p', quality: 'standard', audio: 'smooth' });
    expect(bad.status).toBe(422);
  });

  it('leaves render-settings.json unchanged after a kinotta render with flags, which still apply', { timeout: RENDER_TIMEOUT_MS }, async () => {
    const dir = project();
    const saved = `${JSON.stringify({ draft: { fps: 'source', size: 'half', quality: 'standard', audio: 'smooth' } }, null, 2)}\n`;
    writeFileSync(join(dir, 'reels', TINY, SETTINGS_FILE), saved);

    const run = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveRun) => {
      const child = spawn(process.execPath, [LAUNCHER, 'render', TINY, 'v1', '--preset', 'draft', '--fps', '24', '--size', '1080p', '--quality', 'high', '--audio', 'hard'], { cwd: dir });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
      child.on('close', (status) => resolveRun({ status, stdout, stderr }));
    });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(join(dir, 'reels', TINY, 'renders', 'tiny-v1-draft-1080p24-high.mp4'));
    expect(readFileSync(join(dir, 'reels', TINY, SETTINGS_FILE), 'utf8')).toBe(saved);
  });

  it('prints the usage for an unknown setting value', async () => {
    const run = spawnSync(process.execPath, [LAUNCHER, 'render', TINY, 'v1', '--preset', 'draft', '--size', '8k'], { cwd: project(), encoding: 'utf8' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Usage: kinotta render');
  });
});
