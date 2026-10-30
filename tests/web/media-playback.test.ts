import { mediaAudioBytes } from '../../web/src/api/index.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { MediaPlaybackEngine } from '../../web/src/review/_internal/MediaPlaybackEngine.ts';
import type { MediaPlan } from '../../server/core/model.ts';

afterEach(() => vi.unstubAllGlobals());

function audioClock() {
  const starts: number[][] = [];
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect(target: unknown) { return target; }, disconnect() {}, gain: param() });
  const context = { currentTime: 0, destination: node(),
    decodeAudioData: vi.fn(async () => ({})), createGain: node,
    createBufferSource: () => ({ ...node(), start: (...args: number[]) => starts.push(args), stop() {} }),
    resume: async () => {}, suspend: async () => {}, close: async () => {},
  };
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return { context: context as unknown as AudioContext, starts, decode: context.decodeAudioData };
}

const media: MediaPlan = { schema: 1,
  sources: [{ id: 'voice', kind: 'video', path: 'voice.mp4', duration: 12 }],
  placements: [{ id: 'take', role: 'main', source: 'voice', in: 0, out: 12 }], sequence: ['take'] };
const url = (id: string) => `/api/media/${id}?reel=test&version=1`;

it('keeps readiness and decoded sound while an edit reschedules from the current audio clock', async () => {
  const { context, starts, decode } = audioClock();
  const bytes = vi.fn(async (_url: string) => new ArrayBuffer(1));
  const engine = new MediaPlaybackEngine(context, bytes);
  await engine.update(media, 12, url);
  await engine.toggle();
  (context as unknown as { currentTime: number }).currentTime = 2.25;
  const edited = { ...media, placements: [{ ...media.placements[0]!, out: 10 }] } as MediaPlan;
  const updating = engine.update(edited, 10, (id) => url(id));
  expect(engine.getSnapshot()).toMatchObject({ ready: true, playing: true, time: 2.25 });
  await updating;
  expect(bytes).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(starts.at(-1)).toEqual([2.25, 2.25, 7.75]);
  engine.dispose();
});

it('prepares only a genuinely new source and keeps unchanged sound cached on retry', async () => {
  const { context, decode } = audioClock();
  const bytes = vi.fn(async (_url: string) => new ArrayBuffer(1));
  const engine = new MediaPlaybackEngine(context, bytes);
  await engine.update(media, 12, url);
  await engine.update({ ...media, sources: [...media.sources, { id: 'new', kind: 'audio', path: '', duration: 12 }],
    placements: [...media.placements, { id: 'sound', role: 'audio', source: 'new', in: 0, out: 12, at: 0 }] }, 12, url);
  expect(decode).toHaveBeenCalledTimes(2);
  expect(bytes.mock.calls.map((call) => call[0])).toEqual([url('voice'), url('new')]);
  engine.dispose();
});

it('uses audio-only bytes with saved reel/version and falls back only for a missing route', async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:9999' } });
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1, 2])))
    .mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response(new Uint8Array([3])));
  vi.stubGlobal('fetch', fetcher);
  expect(new Uint8Array(await mediaAudioBytes('/media/a%20reel/2/voice'))).toEqual(new Uint8Array([1, 2]));
  expect(fetcher.mock.calls[0]![0]).toBe('http://localhost:9999/api/media/voice/audio?reel=a+reel&version=2');
  expect(new Uint8Array(await mediaAudioBytes('/media/voice'))).toEqual(new Uint8Array([3]));
  expect(fetcher.mock.calls[2]![0]).toBe('/media/voice');
});

it("uses a legacy reel's footage audio file instead of the whole video, and falls back while it is missing", async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:9999' } });
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([4])))
    .mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response(new Uint8Array([5])));
  vi.stubGlobal('fetch', fetcher);
  expect(new Uint8Array(await mediaAudioBytes('/footage/a%20reel'))).toEqual(new Uint8Array([4]));
  expect(fetcher.mock.calls[0]![0]).toBe('http://localhost:9999/footage/a%20reel/audio');
  expect(new Uint8Array(await mediaAudioBytes('/footage/a%20reel'))).toEqual(new Uint8Array([5]));
  expect(fetcher.mock.calls[2]![0]).toBe('/footage/a%20reel');
});


it('retains Working context when requesting extracted audio', async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:9999' } });
  const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([7])));
  vi.stubGlobal('fetch', fetcher);
  expect(new Uint8Array(await mediaAudioBytes('/media/a%20reel/2/voice?working=1'))).toEqual(new Uint8Array([7]));
  expect(fetcher.mock.calls[0]![0]).toBe('http://localhost:9999/api/media/voice/audio?reel=a+reel&version=2&working=1');
});
