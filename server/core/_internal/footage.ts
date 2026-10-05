import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import type { CaptionsPlan, PlanClip } from './edit-model.ts';
import { pieceMap } from './pieces.ts';
import type { Piece, PlacedPiece } from './pieces.ts';
import { readReelPlan } from './sources.ts';
import { playbackPath } from './import.ts';
import type { Shot, TranscriptWord, Version } from './types.ts';

const REEL_FILE = 'reel.json';
const TRANSCRIPT_FILE = 'transcript.json';
const PLAN_FILE = 'plan.json';
/** The engine rounds timeline times to this many decimals; so does this, so a word on a shot's edge lands the same side. */
const TIME_DECIMALS = 1e6;
const onTimeline = (seconds: number): number => Math.round(seconds * TIME_DECIMALS) / TIME_DECIMALS;
const REELS_DIR = 'reels';

/** A reel folder name: no dot start, no separators. */
export const SAFE_SLUG = /^[^./\\][^/\\]*$/;

interface FootageRef {
  /** As written in reel.json, relative to the project root. */
  path: string;
  /** Absolute, or null when it points outside the project folder. */
  file: string | null;
}

export async function readReelFootage(projectDir: string, reelDir: string): Promise<FootageRef | null> {
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

/** A file of the version's own folder, else the reel's: a version keeps the transcript and plan it was built from (E14). */
async function readOwn(versionDir: string, reelDir: string, name: string): Promise<string | null> {
  for (const dir of [versionDir, reelDir]) {
    try {
      return await readFile(join(dir, name), 'utf8');
    } catch {
      // not in this folder
    }
  }
  return null;
}

type VersionPlan = { pieces?: unknown; captions?: unknown; clips?: unknown };

/**
 * The plan a version was built with, the one resolver pieces, captions and clips all read so they cannot disagree. Its own;
 * else the newest version (an agent built it from the plan Kinotta edits) takes the reel's current plan; else an older one
 * takes the nearest earlier version's own plan, which is what its agent built from; with none of those, no plan, which is
 * how every version from before the pieces were built. Never the reel's current plan for an older version: a Save since
 * has changed it. A plan that cannot be read is no plan.
 */
async function resolvePlan(projectDir: string, versionDir: string, reelDir: string, newest: boolean): Promise<VersionPlan | null> {
  const parse = (text: string): VersionPlan | null => {
    try {
      const plan = JSON.parse(text) as VersionPlan | null;
      return plan !== null && typeof plan === 'object' ? plan : null;
    } catch {
      return null;
    }
  };
  const own = await readFile(join(versionDir, PLAN_FILE), 'utf8').catch(() => null);
  if (own !== null) return parse(own);
  if (newest) return ((await readReelPlan(projectDir, reelDir).catch(() => null))?.plan as VersionPlan | undefined) ?? null;
  const number = Number(/^v(\d+)$/.exec(basename(versionDir))?.[1]);
  for (let earlier = number - 1; Number.isInteger(number) && earlier >= 1; earlier--) {
    const text = await readFile(join(reelDir, `v${earlier}`, PLAN_FILE), 'utf8').catch(() => null);
    if (text !== null) return parse(text);
  }
  return null;
}

async function readTranscript(versionDir: string, reelDir: string): Promise<{ words: TranscriptWord[] } | { problem: string }> {
  const text = await readOwn(versionDir, reelDir, TRANSCRIPT_FILE);
  if (text === null) return { problem: `This reel uses footage but has no ${TRANSCRIPT_FILE}, so shots show no spoken line.` };
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

/** The version's pieces on the timeline, from its plan. A plan with none, or none readable, is one piece over the whole reel. */
function readPieces(plan: VersionPlan | null, duration: number): PlacedPiece[] {
  const listed = Array.isArray(plan?.pieces) ? (plan.pieces as Piece[]) : undefined;
  try {
    return [...pieceMap(listed, duration).pieces];
  } catch {
    return [...pieceMap(undefined, duration).pieces];
  }
}

/** The version plan's captions: `true`, or the object holding the look, colour and positions. Absent when off or unreadable. */
function readCaptions(plan: VersionPlan | null): Version['captions'] {
  const captions = plan?.captions;
  if (captions === true) return true;
  return captions !== null && typeof captions === 'object' && !Array.isArray(captions) ? (captions as CaptionsPlan) : undefined;
}

/** The clips of the version's plan, in source seconds. */
const readClips = (plan: VersionPlan | null): PlanClip[] | undefined => (Array.isArray(plan?.clips) ? (plan.clips as PlanClip[]) : undefined);

/** The transcript on the timeline: words that start inside a piece, cut at its out, in timeline order. */
function wordsOnTimeline(words: TranscriptWord[], pieces: PlacedPiece[]): TranscriptWord[] {
  const placed: TranscriptWord[] = [];
  for (const word of words) {
    const piece = pieces.find((p) => word.start >= p.in && word.start < p.out);
    if (piece) placed.push({ text: word.text, start: onTimeline(piece.at + word.start - piece.in), end: onTimeline(piece.at + Math.min(word.end, piece.out) - piece.in) });
  }
  return placed.sort((a, b) => a.start - b.start);
}

/** A shot's spoken line: the words (on the timeline, like its `line`) that start inside its `line` span. */
function withSpokenLine(shot: Shot, words: TranscriptWord[]): Shot {
  if (!shot.line) return shot;
  const { start, end } = shot.line;
  const inside = words.filter((w) => w.start >= start && w.start < end);
  return { ...shot, words: inside, spoken: inside.map((w) => w.text).join(' ') };
}

/** Adds the footage reference, pieces, transcript and each shot's spoken line to a version of a footage reel. */
export async function addFootage(projectDir: string, reelDir: string, versionDir: string, version: Version): Promise<Version> {
  const ref = await readReelFootage(projectDir, reelDir);
  if (!ref) return version;
  const plan = await resolvePlan(projectDir, versionDir, reelDir, version.isNewest);
  const pieces = readPieces(plan, version.duration);
  const transcript = await readTranscript(versionDir, reelDir);
  const captions = readCaptions(plan);
  const clips = readClips(plan);
  const withFootage: Version = { ...version, footage: { path: ref.path, exists: await isFile(ref.file) }, pieces, ...(captions === undefined ? {} : { captions }), ...(clips === undefined ? {} : { clips }) };
  if ('problem' in transcript) return { ...withFootage, transcriptProblem: transcript.problem };
  const words = wordsOnTimeline(transcript.words, pieces);
  return {
    ...withFootage,
    transcript: words,
    shots: version.shots.map((shot) => withSpokenLine(shot, words)),
  };
}

/** Absolute path of a reel's footage file, or null when the reel has none, it is missing, or it leaves the project. */
export async function footageFile(projectDir: string, slug: string): Promise<string | null> {
  if (!SAFE_SLUG.test(slug)) return null;
  const ref = await readReelFootage(projectDir, join(projectDir, REELS_DIR, slug));
  if (!ref || !(await isFile(ref.file))) return null;
  // An HEVC or ProRes original has an H.264 copy in footage/.playback/ that browsers can play.
  const playback = playbackPath(projectDir, ref.file!);
  return (await isFile(playback)) ? playback : ref.file;
}
