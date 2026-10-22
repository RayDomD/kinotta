import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { KinottaError } from './errors.ts';
import { makeAudioFile, makeEditingProxy, makePlaybackCopy, probeVideo } from './runner.ts';
import type { ImportedVideo } from './types.ts';
import { isVideoFile } from './videos.ts';

const FOOTAGE_DIR = 'footage';
/** Where H.264 copies of videos browsers cannot play live: `footage/.playback/`. A dot folder, so it is never listed as a video. */
const PLAYBACK_DIR = '.playback';
const PLAYBACK_EXT = '.mp4';
export const PROXY_DIR = '.proxy';
export const AUDIO_DIR = '.audio';
export const PROXY_EXT = '.mp4';
export const AUDIO_EXT = '.aac';
/** Joins the folders of a video outside footage/ into its copy's name: `media/talk.mov` becomes `media--talk.mp4`. */
const PLAYBACK_PATH_JOIN = '--';
const PARTIAL_PREFIX = '.incoming-';
const NEEDS_PLAYBACK_COPY = new Set(['hevc', 'prores']);
/** Playback copies made at once; more would starve the rest of the machine (each ffmpeg uses every core). */
const PLAYBACK_COPY_SLOTS = 2;
const UNSAFE_NAME_CHARS = /[<>:"|?*\u0000-\u001f]/g;

/** True for a codec browsers cannot play, whose video needs an H.264 copy. */
export const needsPlaybackCopy = (codec: string): boolean => NEEDS_PLAYBACK_COPY.has(codec);

/**
 * Where the H.264 playback copy of a video in the project lives, whether or not it has been made: `footage/.playback/`,
 * named after the video's path inside footage/ (`footage/talk.mov`) or, for one elsewhere, its project path
 * (`media/talk.mov` gives `media--talk.mp4`). The copies are the only files the editor adds outside reels/ (ADR 0002).
 */
export function playbackPath(projectDir: string, file: string): string {
  const footageDir = resolve(projectDir, FOOTAGE_DIR);
  const inFootage = resolve(file).startsWith(footageDir + sep);
  const rel = relative(inFootage ? footageDir : resolve(projectDir), resolve(file));
  const stem = rel.slice(0, rel.length - extname(rel).length).split(sep).join(PLAYBACK_PATH_JOIN);
  return join(footageDir, PLAYBACK_DIR, `${stem}${PLAYBACK_EXT}`);
}

/** A file name that stays inside footage/: the last segment of whatever was given, with characters Windows refuses replaced. */
function safeName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? '';
  const cleaned = last.replace(UNSAFE_NAME_CHARS, '_').trim().replace(/^\.+/, '');
  if (!isVideoFile(cleaned)) throw new KinottaError('invalid', `${name || 'That file'} is not a video file Kinotta can use.`);
  return cleaned;
}

/** Writes a stream to a file and returns its SHA-256 and size, without holding the video in memory. */
export async function writeHashed(body: AsyncIterable<Uint8Array>, file: string): Promise<{ hash: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      size += chunk.length;
      done(null, chunk);
    },
  });
  await pipeline(Readable.from(body), tap, createWriteStream(file));
  return { hash: hash.digest('hex'), size };
}

/** Only hashes verified against this exact file identity may bypass reading the original again. */
const hashes = new Map<string, { identity: string; hash: string }>();

async function fileIdentity(file: string): Promise<string> {
  const info = await stat(file, { bigint: true });
  return [await realpath(file), info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
}

export async function hashOf(file: string, projectDir?: string): Promise<string> {
  const key = resolve(file);
  const identity = await fileIdentity(key);
  const cache = projectDir && join(projectDir, FOOTAGE_DIR, PLAYBACK_DIR, '.hashes', `${createHash('sha256').update(key).digest('hex')}.json`);
  let known = hashes.get(key);
  if (!known && cache) {
    try {
      const stored: unknown = JSON.parse(await readFile(cache, 'utf8'));
      if (stored && typeof stored === 'object' && 'identity' in stored && 'hash' in stored &&
          typeof stored.identity === 'string' && typeof stored.hash === 'string' && /^[a-f0-9]{64}$/.test(stored.hash)) {
        known = { identity: stored.identity, hash: stored.hash };
      }
    } catch { /* A missing or invalid cache always falls back to hashing the bytes. */ }
  }
  if (known?.identity === identity) {
    hashes.set(key, known);
    return known.hash;
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(key)) hash.update(chunk as Buffer);
  if (await fileIdentity(key) !== identity) throw new KinottaError('invalid', 'The media changed while its content was being verified.');
  const digest = hash.digest('hex');
  const verified = { identity, hash: digest };
  hashes.set(key, verified);
  if (cache) {
    const partial = `${cache}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(cache), { recursive: true });
      await writeFile(partial, JSON.stringify(verified));
      await rename(partial, cache);
    } catch { /* Verification remains valid when a read-only project cannot store its disposable cache. */ }
    finally { await rm(partial, { force: true }).catch(() => undefined); }
  }
  return digest;
}

/** A file already in footage/ with this exact content, or null. Only files of the same size are read. */
async function findIdentical(footageDir: string, size: number, hash: string): Promise<string | null> {
  for (const entry of await readdir(footageDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(PARTIAL_PREFIX)) continue;
    const file = join(footageDir, entry.name);
    if ((await stat(file)).size === size && (await hashOf(file)) === hash) return file;
  }
  return null;
}

const exists = (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false,
  );

/** `talk.mp4`, then `talk-2.mp4`, `talk-3.mp4`: the first name in footage/ not taken. */
async function freeName(footageDir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = basename(name, ext);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${stem}-${n}${ext}`;
    if (!(await exists(join(footageDir, candidate)))) return candidate;
  }
}

/**
 * Brings a dropped video into `<project>/footage/`. The body is streamed to a temp file while it is hashed; a file
 * already in footage/ with the same content is reused and the new copy discarded. HEVC and ProRes also get an H.264
 * copy for playback, finished in the background so the drop returns once the file is in place. The original is never
 * altered. A file that cannot be probed is removed and rejected.
 */
export async function importVideo(projectDir: string, name: string, body: AsyncIterable<Uint8Array>): Promise<ImportedVideo> {
  const wanted = safeName(name);
  const footageDir = join(projectDir, FOOTAGE_DIR);
  await mkdir(footageDir, { recursive: true });
  const partial = join(footageDir, `${PARTIAL_PREFIX}${process.pid}-${Date.now()}`);

  let file: string;
  let copied: boolean;
  let hash: string;
  try {
    const written = await writeHashed(body, partial);
    hash = written.hash;
    const size = written.size;
    const identical = await findIdentical(footageDir, size, hash);
    if (identical !== null) {
      await rm(partial, { force: true });
      file = identical;
      copied = false;
    } else {
      file = join(footageDir, await freeName(footageDir, wanted));
      await rename(partial, file);
      copied = true;
    }
  } catch (err) {
    await rm(partial, { force: true });
    throw err;
  }

  let codec: string;
  try {
    codec = (await probeVideo(file)).codec;
  } catch {
    if (copied) await rm(file, { force: true });
    throw new KinottaError('invalid', `${wanted} is not a video file Kinotta can read.`);
  }
  const needsCopy = needsPlaybackCopy(codec);
  // Finished in the background; starting a reel waits for it, and makes it again (showing the error) if it failed.
  if (needsCopy) ensurePlaybackCopy(projectDir, file).catch(() => undefined);
  ensureProxyAndAudio(projectDir, file, hash).catch(() => undefined);
  return { path: `${FOOTAGE_DIR}/${basename(file)}`, copied, playbackCopy: needsCopy };
}

/** Where the playback copy of a saved version's video lives: named by content, so every version holding the same bytes shares it. */
export function contentPlaybackPath(projectDir: string, hash: string): string {
  return join(resolve(projectDir, FOOTAGE_DIR), PLAYBACK_DIR, `sha256-${hash}${PLAYBACK_EXT}`);
}

/** Copies being made, by destination. Concurrent callers wait on the one transcode instead of starting their own. */
const copying = new Map<string, Promise<void>>();
const slotWaiters: (() => void)[] = [];
let slotsInUse = 0;

/** Runs `work` once one of the PLAYBACK_COPY_SLOTS is free. */
async function inCopySlot<T>(work: () => Promise<T>): Promise<T> {
  if (slotsInUse >= PLAYBACK_COPY_SLOTS) await new Promise<void>((wake) => slotWaiters.push(wake));
  else slotsInUse++;
  try {
    return await work();
  } finally {
    const next = slotWaiters.shift();
    if (next) next();
    else slotsInUse--;
  }
}

/**
 * Makes the playback copy unless it is there, at `dest` (by default the path-named copy). Written to a temp name of its
 * own and renamed, so a half-made copy is never served and two transcodes never share a file.
 */
export function ensurePlaybackCopy(projectDir: string, file: string, dest = playbackPath(projectDir, file)): Promise<void> {
  const key = resolve(dest);
  const running = copying.get(key);
  if (running) return running;
  const job = makeCopy(file, key).finally(() => copying.delete(key));
  copying.set(key, job);
  return job;
}

async function makeCopy(file: string, dest: string): Promise<void> {
  if (await exists(dest)) return;
  await mkdir(dirname(dest), { recursive: true });
  const staged = join(dirname(dest), `${PARTIAL_PREFIX}${randomUUID()}-${basename(dest)}`);
  try {
    await inCopySlot(() => makePlaybackCopy(file, staged));
    await rename(staged, dest);
  } catch (err) {
    await rm(staged, { force: true });
    throw err;
  }
}

export function contentProxyPath(projectDir: string, hash: string): string {
  return join(resolve(projectDir, FOOTAGE_DIR), PROXY_DIR, `sha256-${hash}${PROXY_EXT}`);
}

export function contentAudioPath(projectDir: string, hash: string): string {
  return join(resolve(projectDir, FOOTAGE_DIR), AUDIO_DIR, `sha256-${hash}${AUDIO_EXT}`);
}

export async function findProxyPath(projectDir: string, hash: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const standard = contentProxyPath(projectDir, hash);
  if (await exists(standard)) return standard;
  const unprefixed = join(resolve(projectDir, FOOTAGE_DIR), PROXY_DIR, `${hash}${PROXY_EXT}`);
  if (await exists(unprefixed)) return unprefixed;
  return null;
}

export async function findAudioPath(projectDir: string, hash: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const standard = contentAudioPath(projectDir, hash);
  if (await exists(standard)) return standard;
  const unprefixed = join(resolve(projectDir, FOOTAGE_DIR), AUDIO_DIR, `${hash}${AUDIO_EXT}`);
  if (await exists(unprefixed)) return unprefixed;
  return null;
}

export async function ensureEditingProxy(projectDir: string, file: string, hash?: string): Promise<string> {
  const h = hash ?? await hashOf(file, projectDir);
  const existing = await findProxyPath(projectDir, h);
  if (existing) return existing;
  const dest = contentProxyPath(projectDir, h);
  const key = resolve(dest);
  const running = copying.get(key);
  if (running) {
    await running;
    return dest;
  }
  const job = (async () => {
    if (await exists(dest)) return;
    await mkdir(dirname(dest), { recursive: true });
    const staged = join(dirname(dest), `${PARTIAL_PREFIX}${randomUUID()}-${basename(dest)}`);
    try {
      await inCopySlot(() => makeEditingProxy(file, staged));
      await rename(staged, dest);
    } catch (err) {
      await rm(staged, { force: true }).catch(() => undefined);
      throw err;
    }
  })().finally(() => copying.delete(key));
  copying.set(key, job);
  await job;
  return dest;
}

export async function ensureAudioFile(projectDir: string, file: string, hash?: string): Promise<string | null> {
  const h = hash ?? await hashOf(file, projectDir);
  const existing = await findAudioPath(projectDir, h);
  if (existing) return existing;
  const dest = contentAudioPath(projectDir, h);
  const key = resolve(dest);
  const running = copying.get(key);
  if (running) {
    await running;
    return (await exists(dest)) ? dest : null;
  }
  const job = (async () => {
    if (await exists(dest)) return;
    await mkdir(dirname(dest), { recursive: true });
    const staged = join(dirname(dest), `${PARTIAL_PREFIX}${randomUUID()}-${basename(dest)}`);
    try {
      await inCopySlot(() => makeAudioFile(file, staged));
      await rename(staged, dest);
    } catch (err) {
      await rm(staged, { force: true }).catch(() => undefined);
      throw err;
    }
  })().finally(() => copying.delete(key));
  copying.set(key, job);
  try {
    await job;
    return (await exists(dest)) ? dest : null;
  } catch {
    return null;
  }
}

export function ensureProxyAndAudio(projectDir: string, file: string, hash?: string): Promise<void> {
  return (async () => {
    try {
      const h = hash ?? await hashOf(file, projectDir);
      await Promise.allSettled([
        ensureEditingProxy(projectDir, file, h),
        ensureAudioFile(projectDir, file, h),
      ]);
    } catch {
      // background error is ignored
    }
  })();
}
