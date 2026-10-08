import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { KinottaError } from './errors.ts';
import { writeJsonAtomic } from './edit-list.ts';
import { hashOf } from './import.ts';
import { mediaFile } from './media-library.ts';
import { mediaTimeline } from './media-model.ts';
import type { MediaPlan, MediaSource } from './media-model.ts';
import type { MediaSpeech, Transcriber, TranscriptWord } from './types.ts';

/** Words belong to exact content, so every placement, reel and saved copy of the same bytes shares one transcription. */
const cacheFile = (projectDir: string, hash: string): string => join(projectDir, 'footage', '.transcripts', `${hash}.json`);

async function cachedWords(projectDir: string, hash: string): Promise<TranscriptWord[] | null> {
  const text = await readFile(cacheFile(projectDir, hash), 'utf8').catch(() => null);
  return text === null ? null : (JSON.parse(text) as { words: TranscriptWord[] }).words;
}

export interface MediaSpeechJobs {
  status(source: string, saved?: { reel: string; version: number }): Promise<MediaSpeech>;
  /** Starts a transcription unless the words are cached or one is running. A failed one starts again. */
  start(source: string, saved?: { reel: string; version: number }): Promise<MediaSpeech>;
}

/** Background transcriptions held in memory by content hash. Only the finished words outlive a restart. */
export function createMediaSpeech(projectDir: string, transcriber: Transcriber): MediaSpeechJobs {
  const jobs = new Map<string, MediaSpeech>();
  const locate = async (source: string, saved?: { reel: string; version: number }) => {
    const file = await mediaFile(projectDir, source, saved, true);
    return file === null ? null : { file, hash: await hashOf(file) };
  };
  const missing: MediaSpeech = { state: 'failed', error: 'The original source is missing or changed. Relink it before transcribing.' };
  const status = async (source: string, saved?: { reel: string; version: number }): Promise<MediaSpeech> => {
    const found = await locate(source, saved);
    if (!found) return missing;
    const words = await cachedWords(projectDir, found.hash);
    if (words) return { state: 'ready', words };
    return jobs.get(found.hash) ?? { state: 'idle' };
  };
  return {
    status,
    async start(source, saved) {
      const found = await locate(source, saved);
      if (!found) return missing;
      const now = await status(source, saved);
      if (now.state === 'ready' || now.state === 'running') return now;
      const { file, hash } = found;
      jobs.set(hash, { state: 'running' });
      void transcriber(file).then(
        async (words) => {
          await mkdir(join(projectDir, 'footage', '.transcripts'), { recursive: true });
          await writeJsonAtomic(cacheFile(projectDir, hash), { words });
          jobs.delete(hash);
        },
      ).catch((failure: unknown) => jobs.set(hash, { state: 'failed', error: failure instanceof Error ? failure.message : String(failure) }));
      return { state: 'running' };
    },
  };
}

/** A source supplies captions when a placement selects its speech: a main take by default, anything else when chosen. */
function speechSources(media: MediaPlan): MediaSource[] {
  const used = new Set(mediaTimeline(media).placements.filter((p) => p.role !== 'gap' && (p.role === 'main' ? p.speech !== false : p.speech === true)).map((p) => p.role === 'gap' ? '' : p.source));
  return media.sources.filter((s) => used.has(s.id) && !s.words && !s.id.startsWith('legacy:') && s.kind !== 'image' && s.audio !== false);
}

/** Save freezes the words each selected speech source supplies. Without them its captions would silently vanish. */
export async function withSpeech(projectDir: string, planDir: string, media: MediaPlan): Promise<MediaPlan> {
  const filled = new Map<string, TranscriptWord[]>();
  for (const source of speechSources(media)) {
    const hash = source.contentHash ?? await hashOf(resolve(planDir, source.path)).catch(() => null);
    const words = hash === null ? null : await cachedWords(projectDir, hash);
    if (!words) throw new KinottaError('invalid', `Speech for ${source.name ?? source.id} is not transcribed yet. Wait for it, or retry it, then Save.`);
    filled.set(source.id, words);
  }
  return filled.size === 0 ? media : { ...media, sources: media.sources.map((s) => filled.has(s.id) ? { ...s, words: filled.get(s.id)! } : s) };
}
