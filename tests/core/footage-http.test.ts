import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import type { RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
});

async function serve(projectDir: string): Promise<string> {
  const server = await startServer({ projectDir, port: 0 });
  running.push(server);
  return server.url;
}

describe('GET /footage/<reel>', () => {
  it('serves the whole file with Accept-Ranges when no range is asked for', async () => {
    const dir = copyFixture('footage-project');
    const size = statSync(join(dir, 'media', 'talk.mp4')).size;

    const res = await fetch(`${await serve(dir)}/footage/founder-talk`);

    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect((await res.arrayBuffer()).byteLength).toBe(size);
  });

  it('answers a byte range with 206 and the matching Content-Range', async () => {
    const dir = copyFixture('footage-project');
    const size = statSync(join(dir, 'media', 'talk.mp4')).size;
    const url = await serve(dir);

    const first = await fetch(`${url}/footage/founder-talk`, { headers: { range: 'bytes=0-99' } });
    expect(first.status).toBe(206);
    expect(first.headers.get('content-range')).toBe(`bytes 0-99/${size}`);
    expect((await first.arrayBuffer()).byteLength).toBe(100);

    const open = await fetch(`${url}/footage/founder-talk`, { headers: { range: 'bytes=100-' } });
    expect(open.status).toBe(206);
    expect(open.headers.get('content-range')).toBe(`bytes 100-${size - 1}/${size}`);
    expect((await open.arrayBuffer()).byteLength).toBe(size - 100);

    const tail = await fetch(`${url}/footage/founder-talk`, { headers: { range: 'bytes=-50' } });
    expect(tail.status).toBe(206);
    expect(tail.headers.get('content-range')).toBe(`bytes ${size - 50}-${size - 1}/${size}`);
  });

  it('refuses a range past the end of the file', async () => {
    const dir = copyFixture('footage-project');
    const size = statSync(join(dir, 'media', 'talk.mp4')).size;

    const res = await fetch(`${await serve(dir)}/footage/founder-talk`, { headers: { range: `bytes=${size + 10}-` } });

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${size}`);
  });

  it('is a 404 for a code-only reel and an unknown reel', async () => {
    const url = await serve(copyFixture('showreel-project'));

    expect((await fetch(`${url}/footage/product-showreel`)).status).toBe(404);
    expect((await fetch(`${url}/footage/nope`)).status).toBe(404);
  });

  it('refuses a footage path that leaves the project folder, and a reel name that climbs out', async () => {
    const dir = copyFixture('footage-project');
    writeFileSync(join(dir, '..', 'kinotta-outside.mp4'), 'secret');
    writeFileSync(join(dir, 'reels', 'founder-talk', 'reel.json'), JSON.stringify({ title: 'x', footage: '../kinotta-outside.mp4' }));
    const url = await serve(dir);

    expect((await fetch(`${url}/footage/founder-talk`)).status).toBe(404);
    expect((await fetch(`${url}/footage/..%2F..%2Fmedia`)).status).toBe(404);
    expect((await fetch(`${url}/footage/.founder-talk`)).status).toBe(404);
  });
});
