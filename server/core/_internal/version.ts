import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import type { Overlay, Section, Shot, Version } from './types.ts';

const REELS_DIR = 'reels';
const SHOTS_FILE = 'shots.json';
const SAFE_SLUG = /^[^./\\][^/\\]*$/;

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function newestVersionNumber(reelDir: string): Promise<number> {
  const numbers = (await readdir(reelDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => /^v(\d+)$/.exec(e.name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  return Math.max(...numbers);
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
  const reelDir = join(projectDir, REELS_DIR, slug);
  if (!SAFE_SLUG.test(slug) || !(await isDirectory(reelDir))) {
    throw new KinottaError('not-found', `Reel "${slug}" not found.`);
  }
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
  return version;
}
