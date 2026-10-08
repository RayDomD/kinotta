import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { KinottaError } from './errors.ts';
import { withReelLock, writeJsonAtomic } from './edit-list.ts';
import { ensurePlaybackCopy, hashOf, needsPlaybackCopy, playbackPath, writeHashed } from './import.ts';
import { probeMedia, waveformPeaks } from './runner.ts';
import type { ImportedMedia, MediaEntry, MediaFilter, MediaWaveform, ProjectMediaFile } from './types.ts';
import type { MediaPlan } from './media-model.ts';
import { requireVersionDir } from './approval.ts';

const LIBRARY_FILE = '.media-library.json';
const MEDIA_DIR = 'footage';
const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);
const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function mediaKind(name: string): MediaEntry['kind'] {
  const extension = extname(name).toLowerCase();
  if (VIDEO.has(extension)) return 'video';
  if (AUDIO.has(extension)) return 'audio';
  if (IMAGE.has(extension)) return 'image';
  throw new KinottaError('invalid', `${name} is not supported video, image or audio media.`);
}

async function readLibrary(projectDir: string): Promise<MediaEntry[]> {
  const text = await readFile(join(projectDir, 'reels', LIBRARY_FILE), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '[]';
    throw error;
  });
  const entries: unknown = JSON.parse(text);
  if (!Array.isArray(entries)) throw new KinottaError('invalid', 'The project media library could not be read.');
  return entries as MediaEntry[];
}

export async function listMedia(projectDir: string, filter: MediaFilter = {}): Promise<MediaEntry[]> {
  const search = filter.search?.trim().toLocaleLowerCase() ?? '';
  const entries = (await readLibrary(projectDir)).filter((s) => (!filter.kind || s.kind === filter.kind) && (!search || s.name.toLocaleLowerCase().includes(search)));
  return Promise.all(entries.map(async (s) => {
    const hash = await projectFile(projectDir, s.path).then(hashOf).catch(() => null);
    return { ...s, state: hash === null ? 'missing' : hash === s.contentHash ? 'ready' : 'changed' };
  }));
}

async function projectFile(projectDir: string, path: string): Promise<string> {
  const root = resolve(projectDir);
  const file = resolve(root, path);
  if (!file.startsWith(root + sep)) throw new KinottaError('invalid', 'Media must be inside the project.');
  const actual = await realpath(file);
  const actualRoot = await realpath(root);
  if (!actual.startsWith(actualRoot + sep) || !(await stat(actual)).isFile()) throw new KinottaError('invalid', 'Media must be a file inside the project.');
  return file;
}

/** Serve only a registered Source or a saved version's own Source, never a caller-supplied file path. */
export async function mediaFile(projectDir: string, source: string, saved?: { reel: string; version: number }, original = false): Promise<string | null> {
  try {
    if (!saved) {
      const entry = (await readLibrary(projectDir)).find((s) => s.id === source);
      if (!entry) return null;
      const file = await projectFile(projectDir, entry.path);
      if (await hashOf(file) !== entry.contentHash) return null;
      return !original && entry.playback ? await projectFile(projectDir, entry.playback) : file;
    }
    const { versionDir } = await requireVersionDir(projectDir, saved.reel, saved.version);
    const text = await readFile(join(versionDir, 'plan.json'), 'utf8').catch(() => readFile(join(versionDir, 'media.json'), 'utf8'));
    const plan = JSON.parse(text) as { media?: MediaPlan };
    const entry = plan.media?.sources.find((s) => s.id === source);
    if (!entry) return null;
    const file = await projectFile(projectDir, relative(projectDir, resolve(versionDir, entry.path)));
    if (entry.contentHash && await hashOf(file) !== entry.contentHash) return null;
    if (!original && entry.kind === 'video') {
      const probe = await probeMedia(file, 'video');
      if (needsPlaybackCopy(probe.codec)) {
        await ensurePlaybackCopy(projectDir, file);
        return playbackPath(projectDir, file);
      }
    }
    return file;
  } catch {
    return null;
  }
}

/** Waveform readiness is independent of playback. Cache by exact bytes across all repeated uses. */
export async function mediaWaveform(projectDir: string, source: string, saved?: { reel: string; version: number }): Promise<MediaWaveform> {
  try {
    const file = await mediaFile(projectDir, source, saved, true);
    if (!file) throw new Error('The original source is missing or changed. Relink it before preparing the waveform.');
    const hash = await hashOf(file);
    const cache = join(projectDir, 'footage', '.waveforms', `${hash}.json`);
    const cached = await readFile(cache, 'utf8').catch(() => null);
    if (cached) return JSON.parse(cached) as MediaWaveform;
    const probe = await probeMedia(file, extname(file).toLowerCase() === '.wav' ? 'audio' : mediaKind(file));
    if (!probe.audio) throw new Error('This source has no sound.');
    const waveform: MediaWaveform = { state: 'ready', duration: probe.duration, peaks: await waveformPeaks(file, probe.duration) };
    await mkdir(join(projectDir, 'footage', '.waveforms'), { recursive: true });
    await writeJsonAtomic(cache, waveform);
    return waveform;
  } catch (failure) {
    return { state: 'unavailable', duration: 0, peaks: [], error: failure instanceof Error ? failure.message : 'The waveform could not be prepared.' };
  }
}

/** Existing project content enters the same library without another original copy. */
export async function referenceMedia(projectDir: string, path: string): Promise<ImportedMedia> {
  return withReelLock(projectDir, async () => {
    const file = await projectFile(projectDir, path);
    const kind = mediaKind(file);
    const hash = await hashOf(file);
    const entries = await readLibrary(projectDir);
    const existing = entries.find((s) => s.contentHash === hash);
    if (existing && await hashOf(resolve(projectDir, existing.path)).then((value) => value === hash, () => false)) return { ...existing, copied: false };
    const probe = await probeMedia(file, kind);
    let playback: string | undefined;
    if (kind === 'video' && needsPlaybackCopy(probe.codec)) {
      await ensurePlaybackCopy(projectDir, file);
      playback = relative(projectDir, playbackPath(projectDir, file)).split(sep).join('/');
    }
    const entry: MediaEntry = { id: `sha256:${hash}`, contentHash: hash, kind, name: basename(file), path: relative(projectDir, file).split(sep).join('/'), size: (await stat(file)).size, state: 'ready', ...probe, ...(playback ? { playback } : {}) };
    await mkdir(join(projectDir, 'reels'), { recursive: true });
    await writeJsonAtomic(join(projectDir, 'reels', LIBRARY_FILE), [...entries.filter((s) => s.id !== entry.id), entry]);
    return { ...entry, copied: false };
  });
}

const SKIPPED_FOLDERS = new Set(['node_modules', 'reels']);

async function supportedFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Hidden folders hold Kinotta's own playback copies, waveforms and transcripts.
      if (!entry.name.startsWith('.') && !SKIPPED_FOLDERS.has(entry.name)) found.push(...(await supportedFiles(path)));
    } else if (entry.isFile() && !entry.name.startsWith('.') && [VIDEO, AUDIO, IMAGE].some((set) => set.has(extname(entry.name).toLowerCase()))) found.push(path);
  }
  return found;
}

/** Media already inside the project that the library does not hold yet. Referencing one adds it without a copy. */
export async function listProjectMedia(projectDir: string): Promise<ProjectMediaFile[]> {
  const registered = new Set((await readLibrary(projectDir)).map((s) => s.path));
  const files = (await supportedFiles(resolve(projectDir))).map((file) => relative(projectDir, file).split(sep).join('/')).filter((path) => !registered.has(path)).sort();
  return Promise.all(files.map(async (path) => ({ path, name: basename(path), kind: mediaKind(path), size: (await stat(join(projectDir, path))).size })));
}

/** A relink repairs a path only. Different bytes must become a new Source. */
export async function relinkMedia(projectDir: string, source: string, path: string): Promise<MediaEntry> {
  return withReelLock(projectDir, async () => {
    const entries = await readLibrary(projectDir);
    const entry = entries.find((s) => s.id === source);
    if (!entry) throw new KinottaError('not-found', `Source ${source} is missing from the library.`);
    const file = await projectFile(projectDir, path);
    if (await hashOf(file) !== entry.contentHash) throw new KinottaError('invalid', 'This file has different content. Import it as replacement media instead.');
    const { playback: _old, ...original } = entry;
    let playback: string | undefined;
    if (entry.kind === 'video' && needsPlaybackCopy(entry.codec)) {
      await ensurePlaybackCopy(projectDir, file);
      playback = relative(projectDir, playbackPath(projectDir, file)).split(sep).join('/');
    }
    const repaired: MediaEntry = { ...original, path: relative(projectDir, file).split(sep).join('/'), state: 'ready', ...(playback ? { playback } : {}) };
    await writeJsonAtomic(join(projectDir, 'reels', LIBRARY_FILE), entries.map((s) => s.id === source ? repaired : s));
    return repaired;
  });
}

/** Stream an import, validate and prepare it, then publish its content identity in the project library. */
export async function importMedia(projectDir: string, name: string, body: AsyncIterable<Uint8Array>): Promise<ImportedMedia> {
  const wanted = (name.split(/[\\/]/).pop() ?? '').replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim().replace(/^\.+/, '');
  const kind = mediaKind(wanted);
  return withReelLock(projectDir, async () => {
    const folder = join(projectDir, MEDIA_DIR);
    await mkdir(folder, { recursive: true });
    const partial = join(folder, `.incoming-${randomUUID()}`);
    try {
      const { hash, size } = await writeHashed(body, partial);
      const entries = await readLibrary(projectDir);
      const existing = entries.find((s) => s.contentHash === hash);
      if (existing && await hashOf(resolve(projectDir, existing.path)).then((value) => value === hash, () => false)) return { ...existing, copied: false };
      const probe = await probeMedia(partial, kind);
      const extension = extname(wanted);
      const stem = basename(wanted, extension);
      let selected = wanted;
      for (let index = 2; await stat(join(folder, selected)).then(() => true, () => false); index += 1) selected = `${stem}-${index}${extension}`;
      const file = join(folder, selected);
      await rename(partial, file);
      const path = `${MEDIA_DIR}/${selected}`;
      let playback: string | undefined;
      if (kind === 'video' && needsPlaybackCopy(probe.codec)) {
        // This copy is ours, made moments ago. Unregistered, it would only push a retry onto another name.
        await ensurePlaybackCopy(projectDir, file).catch(async (failure: unknown) => {
          await rm(file, { force: true });
          throw failure;
        });
        playback = playbackPath(projectDir, file).slice(resolve(projectDir).length + 1).replaceAll('\\', '/');
      }
      const entry: MediaEntry = { id: `sha256:${hash}`, contentHash: hash, kind, name: wanted, path, size, state: 'ready', ...probe, ...(playback ? { playback } : {}) };
      await mkdir(join(projectDir, 'reels'), { recursive: true });
      await writeJsonAtomic(join(projectDir, 'reels', LIBRARY_FILE), [...entries.filter((s) => s.id !== entry.id), entry]);
      return { ...entry, copied: true };
    } finally {
      await rm(partial, { force: true });
    }
  });
}
