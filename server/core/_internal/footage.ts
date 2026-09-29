import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Shot, TranscriptWord, Version } from './types.ts';

const REEL_FILE = 'reel.json';
const TRANSCRIPT_FILE = 'transcript.json';
const REELS_DIR = 'reels';

/** A reel folder name: no dot start, no separators. */
export const SAFE_SLUG = /^[^./\\][^/\\]*$/;

interface FootageRef {
  /** As written in reel.json, relative to the project root. */
  path: string;
  /** Absolute, or null when it points outside the project folder. */
  file: string | null;
}

async function readReelFootage(projectDir: string, reelDir: string): Promise<FootageRef | null> {
  let footage: unknown;
  try {
    footage = (JSON.parse(await readFile(join(reelDir, REEL_FILE), 'utf8')) as { footage?: unknown }).footage;
  } catch {
    return null;
  }
  if (typeof footage !== 'string' || footage.trim() === '') return null;
  const root = resolve(projectDir);
  const file = resolve(root, footage);
  return { path: footage, file: file.startsWith(root + sep) ? file : null };
}

async function isFile(path: string | null): Promise<boolean> {
  if (path === null) return false;
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function toWord(raw: unknown): TranscriptWord | null {
  const word = raw as { text?: unknown; start?: unknown; end?: unknown } | null;
  if (typeof word?.text !== 'string' || !Number.isFinite(word.start) || !Number.isFinite(word.end)) return null;
  return { text: word.text, start: Number(word.start), end: Number(word.end) };
}

async function readTranscript(reelDir: string): Promise<{ words: TranscriptWord[] } | { problem: string }> {
  let text: string;
  try {
    text = await readFile(join(reelDir, TRANSCRIPT_FILE), 'utf8');
  } catch {
    return { problem: `This reel uses footage but has no ${TRANSCRIPT_FILE}, so shots show no spoken line.` };
  }
  try {
    const raw = (JSON.parse(text) as { words?: unknown }).words;
    if (!Array.isArray(raw)) throw new Error('no words');
    const words = raw.map(toWord);
    if (words.some((w) => w === null)) throw new Error('bad word');
    return { words: words as TranscriptWord[] };
  } catch {
    return { problem: `${TRANSCRIPT_FILE} is not valid: expected { "words": [ { "text", "start", "end" } ] }.` };
  }
}

/** A shot's spoken line: the transcript words that start inside its `line` span. */
function withSpokenLine(shot: Shot, words: TranscriptWord[]): Shot {
  if (!shot.line) return shot;
  const { start, end } = shot.line;
  const inside = words.filter((w) => w.start >= start && w.start < end);
  return { ...shot, words: inside, spoken: inside.map((w) => w.text).join(' ') };
}

/** Adds the footage reference, transcript and each shot's spoken line to a version of a footage reel. */
export async function addFootage(projectDir: string, reelDir: string, version: Version): Promise<Version> {
  const ref = await readReelFootage(projectDir, reelDir);
  if (!ref) return version;
  const transcript = await readTranscript(reelDir);
  const withFootage: Version = { ...version, footage: { path: ref.path, exists: await isFile(ref.file) } };
  if ('problem' in transcript) return { ...withFootage, transcriptProblem: transcript.problem };
  return {
    ...withFootage,
    transcript: transcript.words,
    shots: version.shots.map((shot) => withSpokenLine(shot, transcript.words)),
  };
}

/** Absolute path of a reel's footage file, or null when the reel has none, it is missing, or it leaves the project. */
export async function footageFile(projectDir: string, slug: string): Promise<string | null> {
  if (!SAFE_SLUG.test(slug)) return null;
  const ref = await readReelFootage(projectDir, join(projectDir, REELS_DIR, slug));
  return ref && (await isFile(ref.file)) ? ref.file : null;
}
