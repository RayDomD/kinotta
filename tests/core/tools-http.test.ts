import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import type { RunningServer } from '../../server/main.ts';
import { copyFixture } from '../helpers/project.ts';

const running: RunningServer[] = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.close();
});

describe('GET /api/tools', () => {
  it('lists Python 3, ffmpeg, faster-whisper and Chromium, with the missing ones also named apart', async () => {
    const server = await startServer({ projectDir: copyFixture('showreel-project'), port: 0 });
    running.push(server);

    const res = await fetch(`${server.url}/api/tools`);
    const body = (await res.json()) as { tools: Array<{ id: string; present: boolean; hint: string }>; missing: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(body.tools.map((tool) => tool.id)).toEqual(['python', 'ffmpeg', 'faster-whisper', 'chromium']);
    expect(body.missing.map((tool) => tool.id)).toEqual(body.tools.filter((tool) => !tool.present).map((tool) => tool.id));
    for (const tool of body.tools) expect(tool.hint).not.toBe('');
  });
});