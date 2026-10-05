import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDER_SCRIPT = resolve(import.meta.dirname, '../../skill/kinotta/engine/render.js');
const RENDER_TIMEOUT_MS = 60_000;

/** A 320x180 stage, 0.3 s long: 9 frames at the default 29.97 fps. */
const TINY_PAGE = `<!DOCTYPE html><html><head><style>html,body{margin:0}#stage{width:320px;height:180px;position:relative;overflow:hidden}
#box{position:absolute;top:60px;width:60px;height:60px;background:#e8741c}</style></head>
<body><div id="stage"><div id="box"></div></div>
<script>window.DURATION=0.3;window.seek=function(t){document.getElementById('box').style.left=(t*800)+'px';};seek(0);</script></body></html>`;

function tinyPage(): { dir: string; page: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kinotta-render-'));
  const page = join(dir, 'tiny.html');
  writeFileSync(page, TINY_PAGE);
  return { dir, page };
}

function render(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [RENDER_SCRIPT, ...args], { encoding: 'utf8', timeout: RENDER_TIMEOUT_MS });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function probe(file: string): { width: number; height: number; frames: number; rate: string } {
  const run = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
  const stream = (JSON.parse(run.stdout) as { streams: Array<{ width: number; height: number; nb_read_frames: string; r_frame_rate: string }> }).streams[0]!;
  return { width: stream.width, height: stream.height, frames: Number(stream.nb_read_frames), rate: stream.r_frame_rate };
}

/** x264 writes its settings into the stream, so the CRF a file was made with can be read back from its bytes. */
const crfOf = (file: string): string | undefined => /crf=(\d+\.\d)/.exec(readFileSync(file).toString('latin1'))?.[1];

describe('render.js', () => {
  it('renders as before with no flags: full size, motion blur, CRF 14 and one closing line', { timeout: RENDER_TIMEOUT_MS }, () => {
    const { dir, page } = tinyPage();
    const out = join(dir, 'out.mp4');

    const run = render([page, out]);

    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`rendered ${out} 9 frames \n`);
    expect(probe(out)).toEqual({ width: 320, height: 180, frames: 9, rate: '30000/1001' });
    expect(crfOf(out)).toBe('14.0');
  });

  it('takes a scale, a frame range, a CRF and no blur, and prints JSON progress', { timeout: RENDER_TIMEOUT_MS }, () => {
    const { dir, page } = tinyPage();
    const out = join(dir, 'half.mp4');

    const run = render([page, out, '30', '--scale', '0.5', '--frames', '2:6', '--crf', '28', '--no-blur', '--progress']);

    expect(run.status).toBe(0);
    const json = run.stdout.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as unknown);
    expect(json).toEqual([
      { width: 160, height: 90, fps: 30, frames: 4 },
      { frame: 1, frames: 4 },
      { frame: 2, frames: 4 },
      { frame: 3, frames: 4 },
      { frame: 4, frames: 4 },
    ]);
    expect(probe(out)).toEqual({ width: 160, height: 90, frames: 4, rate: '30/1' });
    expect(crfOf(out)).toBe('28.0');
  });

  it('draws a page without a #stage at the 1920x1080 viewport', { timeout: RENDER_TIMEOUT_MS }, () => {
    const { dir, page } = tinyPage();
    writeFileSync(page, TINY_PAGE.replace('id="stage"', 'id="frame"'));
    const out = join(dir, 'viewport.mp4');

    const run = render([page, out, '30', '--scale', '0.25', '--frames', '0:1', '--no-blur']);

    expect(run.status).toBe(0);
    expect(probe(out)).toMatchObject({ width: 480, height: 270, frames: 1 });
  });

  it('keeps every frame when the page turns from opaque to transparent with a codec given', { timeout: RENDER_TIMEOUT_MS }, () => {
    const { dir, page } = tinyPage();
    // An opaque cover for the first half, then nothing: the screenshots change from RGB to RGBA PNGs.
    writeFileSync(page, TINY_PAGE.replace("style.left=(t*800)+'px';", "style.left=(t*800)+'px';document.getElementById('stage').style.background=t<0.15?'#211b16':'transparent';"));
    const out = join(dir, 'clear.mov');

    const run = render([page, out, '30', '--codec', 'prores']);

    expect(run.status).toBe(0);
    expect(probe(out).frames).toBe(9);
  });

  it('exits non-zero when the page has no seek', { timeout: RENDER_TIMEOUT_MS }, () => {
    const { dir, page } = tinyPage();
    writeFileSync(page, TINY_PAGE.replace(/window\.seek=[^;]*;\};seek\(0\);/, ''));

    expect(render([page, join(dir, 'none.mp4'), '30', '--no-blur']).status).not.toBe(0);
  });
});
