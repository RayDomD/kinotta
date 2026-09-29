import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { SAFE_SLUG, addFootage } from './footage.ts';
import type { Overlay, Section, Shot, Version, VersionEntry } from './types.ts';

const REELS_DIR = 'reels';
const SHOTS_FILE = 'shots.json';
const STORYBOARD_VERSION = 1;

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function versionNumbers(reelDir: string): Promise<number[]> {
  return (await readdir(reelDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => /^v(\d+)$/.exec(e.name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

async function newestVersionNumber(reelDir: string): Promise<number> {
  return Math.max(...(await versionNumbers(reelDir)));
}

async function requireReelDir(projectDir: string, slug: string): Promise<string> {
  const reelDir = join(projectDir, REELS_DIR, slug);
  if (!SAFE_SLUG.test(slug) || !(await isDirectory(reelDir))) {
    throw new KinottaError('not-found', `Reel "${slug}" not found.`);
  }
  return reelDir;
}

/** Every version folder of a reel, oldest first. v1 is the storyboard in this phase. */
export async function listVersions(projectDir: string, slug: string): Promise<VersionEntry[]> {
  const numbers = await versionNumbers(await requireReelDir(projectDir, slug));
  const newest = numbers[numbers.length - 1];
  return numbers.map((number) => ({ number, isNewest: number === newest, isStoryboard: number === STORYBOARD_VERSION }));
}

/**
 * The one guard every comment change goes through (S6): only the newest version takes changes. Throws
 * `not-found` for an unknown reel or version and `frozen` for an older one.
 */
export async function assertTakesComments(projectDir: string, slug: string, number: number): Promise<Version> {
  const version = await readVersion(projectDir, slug, number);
  if (!version.isNewest) {
    const newest = await newestVersionNumber(join(projectDir, REELS_DIR, slug));
    throw new KinottaError('frozen', `v${number} is frozen. Only the newest version, v${newest}, takes comments.`);
  }
  return version;
}

async function readShotsFile(versionDir: string, number: number): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(join(versionDir, SHOTS_FILE), 'utf8');
  } catch {
    throw new KinottaError('invalid', `Version ${number} has no ${SHOTS_FILE}.`);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new KinottaError('invalid', `Version ${number}: ${SHOTS_FILE} is not valid JSON.`);
  }
}

function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readShots(raw: unknown, duration: number, number: number): Shot[] {
  if (!Array.isArray(raw)) throw new KinottaError('invalid', `Version ${number}: ${SHOTS_FILE} has no shot list.`);
  const shots = raw as Array<Record<string, unknown>>;
  return shots.map((shot, i) => {
    const start = Number(shot.start);
    const next = shots[i + 1];
    const end = next ? Number(next.start) : duration;
    return {
      ...(shot as object),
      number: String(shot.number ?? ''),
      start,
      duration: Math.max(0, end - start),
      title: String(shot.title ?? ''),
      description: String(shot.description ?? ''),
    } as Shot;
  });
}

export async function readVersion(projectDir: string, slug: string, number: number): Promise<Version> {
  const reelDir = await requireReelDir(projectDir, slug);
  const versionDir = join(reelDir, `v${number}`);
  if (!Number.isInteger(number) || number < 1 || !(await isDirectory(versionDir))) {
    throw new KinottaError('not-found', `Version ${number} of reel "${slug}" not found.`);
  }
  const file = await readShotsFile(versionDir, number);
  const duration = Number(file.duration);
  if (!Number.isFinite(duration)) throw new KinottaError('invalid', `Version ${number}: ${SHOTS_FILE} has no duration.`);
  const version: Version = {
    number,
    isNewest: number === (await newestVersionNumber(reelDir)),
    duration,
    shots: readShots(file.shots, duration, number),
    overlays: listOf<Overlay>(file.overlays),
  };
  if (Array.isArray(file.sections)) version.sections = file.sections as Section[];
  if (Array.isArray(file.changedSections)) version.changedSections = file.changedSections as string[];
  return addFootage(projectDir, reelDir, version);
}
