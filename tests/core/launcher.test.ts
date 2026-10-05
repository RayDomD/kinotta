import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyFixture } from '../helpers/project.ts';

const LAUNCHER = resolve(import.meta.dirname, '../../bin/kinotta.mjs');
const URL_LINE = /^Kinotta: (http:\/\/localhost:(\d+))\s*$/m;
const LAUNCH_TIMEOUT_MS = 20_000;

const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

function launch(args: string[]): Promise<{ url: string; port: number }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [LAUNCHER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let out = '';
    const timer = setTimeout(() => reject(new Error(`no URL line. Output: ${out}`)), LAUNCH_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = URL_LINE.exec(out);
      if (match) {
        clearTimeout(timer);
        resolvePromise({ url: match[1], port: Number(match[2]) });
      }
    });
    child.on('exit', () => reject(new Error(`launcher exited. Output: ${out}`)));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolvePromise) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolvePromise(port));
    });
  });
}

describe('launcher', () => {
  it('prints the URL line and serves the reels list for the given project', async () => {
    const dir = copyFixture('showreel-project');
    const port = await freePort();

    const started = await launch(['--project', dir, '--port', String(port), '--no-open']);
    const res = await fetch(`${started.url}/api/reels`);
    const body = (await res.json()) as { state: string; reels: unknown[] };

    expect(started.port).toBe(port);
    expect(body.state).toBe('ok');
    expect(body.reels).toHaveLength(2);
  });

  it('falls back to a free port when the requested one is taken', async () => {
    const dir = copyFixture('showreel-project');
    const busy = createServer();
    await new Promise<void>((r) => busy.listen(0, r));
    const busyPort = (busy.address() as { port: number }).port;

    try {
      const started = await launch(['--project', dir, '--port', String(busyPort), '--no-open']);
      expect(started.port).not.toBe(busyPort);
    } finally {
      busy.close();
    }
  });

  it('names the tools a start from video needs when they are missing', async () => {
    const dir = copyFixture('showreel-project');
    const bare = dirname(process.execPath);
    const child = spawn(process.execPath, [LAUNCHER, '--project', dir, '--port', '0', '--no-open'], {
      env: { ...process.env, PATH: bare, Path: bare },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let err = '';
    child.stderr.on('data', (chunk) => (err += chunk));
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error(`no warning. stderr: ${err}`)), LAUNCH_TIMEOUT_MS);
      child.stderr.on('data', () => {
        if (err.includes('faster-whisper')) {
          clearTimeout(timer);
          done();
        }
      });
    });
    expect(err).toContain('Python 3:');
    expect(err).toContain('ffmpeg:');
  });
});
