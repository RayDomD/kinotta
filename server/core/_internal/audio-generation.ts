import { randomInt } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { importMedia } from './media-library.ts';
import { MAX_GENERATED_SECONDS } from './media-model.ts';
import { generateStableAudio } from './runner.ts';
import type { ImportedMedia } from './types.ts';

export const MODEL_ENV = 'KINOTTA_STABLE_AUDIO_MODEL';
const MAX_PROMPT_CHARS = 500;
const MAX_SEED = 2 ** 31 - 1;
const MAX_NAME_SLUG = 40;

export interface AudioGenerationRequest {
  prompt: string;
  seconds: number;
  /** Same prompt, length and seed give the same sound. A random seed is chosen and reported when omitted. */
  seed?: number;
}

export interface GeneratedAudio extends ImportedMedia {
  prompt: string;
  seconds: number;
  seed: number;
}

export interface GenerateJob {
  prompt: string;
  seconds: number;
  seed: number;
  model: string;
  output: string;
  signal?: AbortSignal;
}

export type GenerateRun = (job: GenerateJob) => Promise<void>;

export interface AudioGenerationOptions {
  /** The local Stable Audio Open folder. Defaults to the environment variable. */
  model?: string;
  generate?: GenerateRun;
}

const slugOf = (prompt: string): string => prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_NAME_SLUG).replace(/-+$/, '') || 'sound';

/**
 * Local sound generation shared by the editor and the CLI. One generation runs at a time, because the model owns the GPU.
 * An identical request while one runs shares it, and the result enters the project library by content like any import.
 */
export function createAudioGeneration(projectDir: string, options: AudioGenerationOptions = {}) {
  const generate = options.generate ?? generateStableAudio;
  let running: { key: string; job: Promise<GeneratedAudio> } | null = null;

  const validated = (request: AudioGenerationRequest): Required<AudioGenerationRequest> => {
    const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) throw new KinottaError('invalid', `The prompt must be 1 to ${MAX_PROMPT_CHARS} characters.`);
    const { seconds } = request;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_GENERATED_SECONDS) throw new KinottaError('invalid', `Seconds must be above 0 and at most ${MAX_GENERATED_SECONDS}.`);
    const seed = request.seed ?? randomInt(MAX_SEED);
    if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new KinottaError('invalid', `The seed must be a whole number from 0 to ${MAX_SEED}.`);
    return { prompt, seconds, seed };
  };

  const modelFolder = async (): Promise<string> => {
    const model = options.model ?? process.env[MODEL_ENV];
    const present = model ? await stat(model).then((info) => info.isDirectory(), () => false) : false;
    if (!model || !present) throw new KinottaError('invalid', `Stable Audio Open is not set up. Set ${MODEL_ENV} to the folder holding the local model.`);
    return model;
  };

  const run = async (request: Required<AudioGenerationRequest>, model: string, signal?: AbortSignal): Promise<GeneratedAudio> => {
    const folder = await mkdtemp(join(tmpdir(), 'kinotta-generate-'));
    const output = join(folder, 'sound.wav');
    try {
      // A stop that arrives while the model check runs would otherwise start a run nobody waits for.
      if (signal?.aborted) throw new KinottaError('invalid', 'The generation was stopped.');
      await generate({ ...request, model, output, signal });
      if (!await stat(output).then((info) => info.size > 0, () => false)) throw new KinottaError('invalid', 'The model finished but produced no audio.');
      const name = `generated-${slugOf(request.prompt)}-s${request.seed}.wav`;
      return { ...await importMedia(projectDir, name, createReadStream(output)), ...request };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  };

  return async (request: AudioGenerationRequest, signal?: AbortSignal): Promise<GeneratedAudio> => {
    const wanted = validated(request);
    const key = JSON.stringify(wanted);
    if (running) {
      if (running.key === key) return running.job;
      throw new KinottaError('invalid', 'Another sound is still generating. Wait for it to finish.');
    }
    // Take the slot before any await, so two requests in the same tick cannot both start.
    const job = (async () => run(wanted, await modelFolder(), signal))().finally(() => { running = null; });
    running = { key, job };
    return job;
  };
}
