import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { KinottaError } from './errors.ts';
import { makePlaybackCopy, probeVideo } from './runner.ts';
import type { ImportedVideo } from './types.ts';
import { isVideoFile } from './videos.ts';

const FOOTAGE_DIR = 'footage';
/** Where H.264 copies of videos browsers cannot play live: `footage/.playback/`. A dot folder, so it is never listed as a video. */
const PLAYBACK_DIR = '.playback';
const PLAYBACK_EXT = '.mp4';
/** Joins the folders of a video outside footage/ into its copy's name: `media/talk.mov` becomes `media--talk.mp4`. */
const PLAYBACK_PATH_JOIN = '--';
const PARTIAL_PREFIX = '.incoming-';
const NEEDS_PLAYBACK_COPY = new Set(['hevc', 'prores']);
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

export async function hashOf(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
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
 * copy for playback; the original is never altered. A file that cannot be probed is removed and rejected.
 */
export async function importVideo(projectDir: string, name: string, body: AsyncIterable<Uint8Array>): Promise<ImportedVideo> {
  const wanted = safeName(name);
  const footageDir = join(projectDir, FOOTAGE_DIR);
  await mkdir(footageDir, { recursive: true });
  const partial = join(footageDir, `${PARTIAL_PREFIX}${process.pid}-${Date.now()}`);

  let file: string;
  let copied: boolean;
  try {
    const { hash, size } = await writeHashed(body, partial);
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
  if (needsCopy) await ensurePlaybackCopy(projectDir, file);
  return { path: `${FOOTAGE_DIR}/${basename(file)}`, copied, playbackCopy: needsCopy };
}

/** Makes the playback copy unless it is there. Written to a temp name and renamed, so a half-made copy is never served. */
export async function ensurePlaybackCopy(projectDir: string, file: string): Promise<void> {
  const dest = playbackPath(projectDir, file);
  if (await exists(dest)) return;
  await mkdir(dirname(dest), { recursive: true });
  const staged = join(dirname(dest), `${PARTIAL_PREFIX}${basename(dest)}`);
  try {
    await makePlaybackCopy(file, staged);
    await rename(staged, dest);
  } catch (err) {
    await rm(staged, { force: true });
    throw err;
  }
}
