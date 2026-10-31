import { readdir, stat, statfs } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { KinottaError } from './errors.ts';

/**
 * What an import will do, worked out before any byte is copied (docs/plans/2026-10-31-import-preview.md). It follows
 * the import paths' own rules: `reel` is the New reel drop (`importVideo`, videos only) and `media` the media library
 * (`importMedia`, video, sound and pictures). The browser knows only names and sizes, so a duplicate is "maybe" (same
 * size; confirmed by content during the import) and a playback copy is "may need" (the codec is read after copying).
 */
export type ImportMode = 'reel' | 'media';
export interface ImportPreviewFile { name: string; size: number }
export interface ImportPreviewItem {
  name: string;
  size: number;
  /** `new`: copied under its own name. `renamed`: copied under `destination` since the name is taken. */
  status: 'new' | 'renamed' | 'maybe-duplicate' | 'unsupported';
  /** Where the copy goes, `footage/<name>`, unless unsupported. */
  destination?: string;
  /** A video that may need an H.264 playback copy (HEVC or ProRes, known once copied). */
  mayNeedPlaybackCopy?: true;
  reason?: string;
}
export interface ImportPreview {
  items: ImportPreviewItem[];
  /** Bytes of the files to copy. A maybe-duplicate counts, since the import confirms it only after copying. */
  copyBytes: number;
  /** An estimate of the editing proxies, sound and playback copies made afterwards. */
  extraBytes: number;
  freeBytes: number;
  /** True when the free space covers the copy, the estimate and a margin. */
  enough: boolean;
  /** How much more space the import needs, when not enough. */
  shortBy?: number;
}

const FOOTAGE_DIR = 'footage';
const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);
const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
/** Containers HEVC and ProRes arrive in. WebM never needs a playback copy. */
const MAYBE_PLAYBACK_COPY = new Set(['.mp4', '.mov', '.m4v', '.mkv']);
/** Proxy, sound and a possible playback copy, as a share of the source: generous, since the codec is unknown. */
const VIDEO_EXTRA = 0.5;
const AUDIO_EXTRA = 0.1;
/** Room left over after the import, so the project's next render or transcription can still write. */
export const IMPORT_MARGIN_BYTES = 512 * 1024 * 1024;
const UNSAFE = /[<>:"|?*\u0000-\u001f]/g;

/** The name the import paths give a file: its last segment, with characters Windows refuses replaced. */
const cleanName = (name: string): string => (name.split(/[\\/]/).pop() ?? '').replace(UNSAFE, '_').trim().replace(/^\.+/, '');

async function freeBytesOf(dir: string): Promise<number> {
  const fs = await statfs(dir);
  return Number(fs.bavail) * Number(fs.bsize);
}

/** Sizes of the files already at the top of footage/, or none when it does not exist yet. */
async function footageSizes(projectDir: string): Promise<Set<number>> {
  const sizes = new Set<number>();
  for (const entry of await readdir(join(projectDir, FOOTAGE_DIR), { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const size = await stat(join(projectDir, FOOTAGE_DIR, entry.name)).then((s) => s.size, () => -1);
    if (size >= 0) sizes.add(size);
  }
  return sizes;
}

/** Taken as the import finds it: the file system decides, so case counts where it does (Linux) and not where it doesn't. */
const onDisk = (projectDir: string, name: string): Promise<boolean> => stat(join(projectDir, FOOTAGE_DIR, name)).then(() => true, () => false);

export async function previewImport(projectDir: string, mode: ImportMode, files: readonly ImportPreviewFile[], free: (dir: string) => Promise<number> = freeBytesOf): Promise<ImportPreview> {
  if (mode !== 'reel' && mode !== 'media') throw new KinottaError('invalid', 'Choose where the files are imported: a new reel or the media library.');
  if (!Array.isArray(files) || files.length === 0) throw new KinottaError('invalid', 'Choose at least one file to import.');
  const sizes = await footageSizes(projectDir);
  // Names chosen earlier in this drop; their copies land in order, so a later one is numbered past them.
  const chosen = new Set<string>();
  const taken = async (name: string) => chosen.has(name.toLowerCase()) || await onDisk(projectDir, name);
  const items: ImportPreviewItem[] = [];
  let copyBytes = 0;
  let extraBytes = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || !Number.isFinite(file.size) || file.size < 0) throw new KinottaError('invalid', 'Each file needs its name and size.');
    const name = cleanName(file.name);
    const extension = extname(name).toLowerCase();
    const video = VIDEO.has(extension);
    const supported = mode === 'reel' ? video : video || AUDIO.has(extension) || IMAGE.has(extension);
    if (!name || !supported) {
      items.push({ name: file.name, size: file.size, status: 'unsupported', reason: mode === 'reel' ? 'Not a video Kinotta can use. Use MP4, MOV, M4V, MKV or WebM.' : 'Not video, sound or a picture Kinotta can use.' });
      continue;
    }
    copyBytes += file.size;
    extraBytes += Math.ceil(file.size * (video ? VIDEO_EXTRA : AUDIO.has(extension) ? AUDIO_EXTRA : 0));
    const playback = video && MAYBE_PLAYBACK_COPY.has(extension) ? { mayNeedPlaybackCopy: true as const } : {};
    if (sizes.has(file.size)) {
      items.push({ name: file.name, size: file.size, status: 'maybe-duplicate', destination: `${FOOTAGE_DIR}/${name}`, reason: 'A file of the same size is already in footage/. If it is the same, it is reused and not copied again.', ...playback });
      continue;
    }
    const stem = basename(name, extname(name));
    let selected = name;
    for (let n = 2; await taken(selected); n += 1) selected = `${stem}-${n}${extname(name)}`;
    chosen.add(selected.toLowerCase());
    items.push({ name: file.name, size: file.size, status: selected === name ? 'new' : 'renamed', destination: `${FOOTAGE_DIR}/${selected}`, ...playback });
  }
  const freeBytes = await free(projectDir);
  const needed = copyBytes + extraBytes + IMPORT_MARGIN_BYTES;
  const enough = copyBytes === 0 || freeBytes >= needed;
  return { items, copyBytes, extraBytes, freeBytes, enough, ...(enough ? {} : { shortBy: needed - freeBytes }) };
}
