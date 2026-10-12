import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer } from '../../server/main.ts';
import { createAudioGeneration, MODEL_ENV } from '../../server/core/_internal/audio-generation.ts';
import { MAX_GENERATED_SECONDS } from '../../server/core/model.ts';
import type { GenerateRun } from '../../server/core/_internal/audio-generation.ts';

/** A valid 8 kHz mono 16-bit WAV of silence, long enough for ffprobe to read. */
function wav(seconds: number): Buffer {
  const samples = Math.round(8000 * seconds);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples * 2, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24); header.writeUInt32LE(16000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}

let project: string;
let model: string;
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'kinotta-gen-project-'));
  model = await mkdtemp(join(tmpdir(), 'kinotta-gen-model-'));
  await mkdir(join(project, 'reels'), { recursive: true });
});
afterEach(async () => {
  await rm(project, { recursive: true, force: true });
  await rm(model, { recursive: true, force: true });
});

const writes = (seconds = 1): GenerateRun => async (job) => { await writeFile(job.output, wav(seconds)); };

describe('audio generation', () => {
  it('imports the generated WAV into the project library with its prompt, length and seed', async () => {
    const calls: Array<{ prompt: string; seconds: number; seed: number; model: string }> = [];
    const generate = createAudioGeneration(project, { model, generate: async (job) => { calls.push({ prompt: job.prompt, seconds: job.seconds, seed: job.seed, model: job.model }); await writeFile(job.output, wav(1)); } });
    const result = await generate({ prompt: '  Warm synth bed  ', seconds: 1, seed: 42 });
    expect(calls).toEqual([{ prompt: 'Warm synth bed', seconds: 1, seed: 42, model }]);
    expect(result).toMatchObject({ kind: 'audio', copied: true, prompt: 'Warm synth bed', seconds: 1, seed: 42 });
    expect(result.name).toBe('generated-warm-synth-bed-s42.wav');
    expect(await readFile(join(project, result.path))).toEqual(wav(1));
  });

  it('reuses the library entry when the same bytes come back', async () => {
    const generate = createAudioGeneration(project, { model, generate: writes() });
    const first = await generate({ prompt: 'bed', seconds: 1, seed: 1 });
    const second = await generate({ prompt: 'bed', seconds: 1, seed: 1 });
    expect(second.id).toBe(first.id);
    expect(second.copied).toBe(false);
  });

  it('picks a seed when none is given and reports it', async () => {
    const generate = createAudioGeneration(project, { model, generate: writes() });
    const result = await generate({ prompt: 'bed', seconds: 1 });
    expect(Number.isInteger(result.seed)).toBe(true);
    expect(result.seed).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [{ prompt: '   ', seconds: 5 }, /prompt/i],
    [{ prompt: 'x', seconds: 0 }, /seconds/i],
    [{ prompt: 'x', seconds: Number.NaN }, /seconds/i],
    [{ prompt: 'x', seconds: MAX_GENERATED_SECONDS + 1 }, /seconds/i],
    [{ prompt: 'x', seconds: 5, seed: 1.5 }, /seed/i],
    [{ prompt: 'x', seconds: 5, seed: -1 }, /seed/i],
  ])('rejects %j before starting the model', async (request, message) => {
    let started = false;
    const generate = createAudioGeneration(project, { model, generate: async () => { started = true; } });
    await expect(generate(request)).rejects.toThrow(message);
    expect(started).toBe(false);
  });

  it('says how to configure the model when it is missing', async () => {
    const generate = createAudioGeneration(project, { model: join(model, 'absent'), generate: writes() });
    await expect(generate({ prompt: 'x', seconds: 1 })).rejects.toThrow(/KINOTTA_STABLE_AUDIO_MODEL/);
  });

  it('refuses a second generation while one is running, and shares an identical one', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started = 0;
    const generate = createAudioGeneration(project, { model, generate: async (job) => { started += 1; await gate; await writeFile(job.output, wav(1)); } });
    const first = generate({ prompt: 'bed', seconds: 1, seed: 5 });
    const same = generate({ prompt: 'bed', seconds: 1, seed: 5 });
    await expect(generate({ prompt: 'other', seconds: 1, seed: 6 })).rejects.toThrow(/still generating/i);
    release();
    const [a, b] = await Promise.all([first, same]);
    expect(a.id).toBe(b.id);
    expect(started).toBe(1);
  });

  it('frees the slot after a failure so a retry can run', async () => {
    let attempt = 0;
    const generate = createAudioGeneration(project, { model, generate: async (job) => { attempt += 1; if (attempt === 1) throw new Error('out of memory'); await writeFile(job.output, wav(1)); } });
    await expect(generate({ prompt: 'bed', seconds: 1, seed: 1 })).rejects.toThrow(/out of memory/);
    await expect(generate({ prompt: 'bed', seconds: 1, seed: 1 })).resolves.toMatchObject({ kind: 'audio' });
  });

  it('passes an abort to the model run and frees the slot', async () => {
    const controller = new AbortController();
    const generate = createAudioGeneration(project, { model, generate: (job) => new Promise<void>((_, reject) => job.signal?.addEventListener('abort', () => reject(new Error('The run was stopped.')))) });
    const pending = generate({ prompt: 'bed', seconds: 1, seed: 1 }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/stopped/);
    const retry = createAudioGeneration(project, { model, generate: writes() });
    await expect(retry({ prompt: 'bed', seconds: 1, seed: 1 })).resolves.toBeDefined();
  });

  it('fails clearly when the model writes nothing', async () => {
    const generate = createAudioGeneration(project, { model, generate: async () => {} });
    await expect(generate({ prompt: 'bed', seconds: 1, seed: 1 })).rejects.toThrow(/no audio/i);
  });
});

describe('generate route', () => {
  it('rejects a malformed body, and explains a missing model, without starting anything', async () => {
    const saved = process.env[MODEL_ENV];
    delete process.env[MODEL_ENV];
    const server = await startServer({ projectDir: project, port: 0 });
    try {
      const post = (body: unknown) => fetch(`${server.url}/api/media/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect((await post({ prompt: 'bed' })).status).toBe(400);
      expect((await post({ prompt: 'bed', seconds: 5, seed: 'x' })).status).toBe(400);
      const missing = await post({ prompt: 'bed', seconds: 5 });
      expect(missing.status).toBe(422);
      expect((await missing.json()).error).toContain(MODEL_ENV);
      expect((await post({ prompt: '', seconds: 5 })).status).toBe(422);
    } finally {
      await server.close();
      if (saved !== undefined) process.env[MODEL_ENV] = saved;
    }
  });
});
