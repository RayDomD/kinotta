import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EDITS_CSS, isCodeOnly, readEditsCss } from './code-edits.ts';
import { checkShotsAgainstPage, checkShotsFile, scanVersionPage } from './contract.ts';
import { detectChanges } from './changes.ts';
import { KinottaError } from './errors.ts';
import { SAFE_SLUG, addFootage } from './footage.ts';
import { readTitle } from './reels.ts';
import { brollRequest } from './requests.ts';
import { readSections } from './sections.ts';
import { readState, stateFilePath } from './state.ts';
import { versionIssues } from './footage-issues.ts';
import type { Overlay, Shot, Version, VersionEntry } from './types.ts';

const REELS_DIR = 'reels';
const SHOTS_FILE = 'shots.json';
const PAGE_FILE = 'index.html';
const STORYBOARD_VERSION = 1;
/** The approval record in a version folder: `{ approvedBy, at }` (R5). Its presence is the approval. */
export const APPROVAL_FILE = 'approval.json';
const UNTITLED_SHOT = 'Untitled shot';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

const isFile = (path: string): Promise<boolean> => stat(path).then((s) => s.isFile(), () => false);

async function versionNumbers(reelDir: string): Promise<number[]> {
  return (await readdir(reelDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => /^v(\d+)$/.exec(e.name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

/** The newest version's number, or 0 for a reel with no version yet (one still being transcribed). */
export async function newestVersionNumber(reelDir: string): Promise<number> {
  return Math.max(0, ...(await versionNumbers(reelDir)));
}

export async function requireReelDir(projectDir: string, slug: string): Promise<string> {
  const reelDir = join(projectDir, REELS_DIR, slug);
  if (!SAFE_SLUG.test(slug) || !(await isDirectory(reelDir))) {
    throw new KinottaError('not-found', `Reel "${slug}" not found.`);
  }
  return reelDir;
}

/** Every version folder of a reel, oldest first. v1 is the storyboard in this phase. */
export async function listVersions(projectDir: string, slug: string): Promise<VersionEntry[]> {
  const reelDir = await requireReelDir(projectDir, slug);
  const numbers = await versionNumbers(reelDir);
  const newest = numbers[numbers.length - 1];
  return Promise.all(
    numbers.map(async (number): Promise<VersionEntry> => {
      const version = await readVersion(projectDir, slug, number).catch(() => null);
      const approved = await isFile(join(reelDir, `v${number}`, APPROVAL_FILE));
      const comments = (await readState(stateFilePath(projectDir, slug, number), number).catch(() => ({ comments: [] }))).comments.length;
      const issues = version === null ? 0 : versionIssues(version).length;
      const entry: VersionEntry = { number, isNewest: number === newest, isStoryboard: number === STORYBOARD_VERSION, approved, comments, issues, ...(version?.builtBy ? { builtBy: version.builtBy } : {}) };
      if (number === STORYBOARD_VERSION) return entry;
      // A reel with one section has nothing to tell apart, so its rail rows stay as they were.
      return version !== null && version.sections.length > 1 && version.changedSections ? { ...entry, changedSections: version.changedSections } : entry;
    }),
  );
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

/** shots.json as an object, or null with the reason it could not be read. Never throws. */
async function readShotsFile(versionDir: string): Promise<{ file: Record<string, unknown> | null; problem: string | null }> {
  let text: string;
  try {
    text = await readFile(join(versionDir, SHOTS_FILE), 'utf8');
  } catch {
    return { file: null, problem: 'file not found' };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return { file: parsed as Record<string, unknown>, problem: null };
  } catch {
    return { file: null, problem: 'not valid JSON' };
  }
}

async function readPage(versionDir: string): Promise<string | null> {
  try {
    return await readFile(join(versionDir, PAGE_FILE), 'utf8');
  } catch {
    return null;
  }
}

function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** The shots that can be read: an object with a number and a numeric start; a repeated number is dropped. The rest are contract issues. */
function readShots(raw: unknown, duration: number): Shot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const shots = raw.filter((s): s is Record<string, unknown> => {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) return false;
    const shot = s as Record<string, unknown>;
    const number = typeof shot.number === 'number' ? String(shot.number) : shot.number;
    if (typeof number !== 'string' || number.trim() === '' || seen.has(number)) return false;
    if (shot.start === undefined || shot.start === null || shot.start === '' || !Number.isFinite(Number(shot.start))) return false;
    seen.add(number);
    return true;
  });
  return shots.map((shot, i) => {
    const start = Number(shot.start);
    const next = shots[i + 1];
    const end = next ? Number(next.start) : duration;
    return {
      ...(shot as object),
      number: String(shot.number ?? ''),
      start,
      duration: Math.max(0, end - start),
      // A shot with no title still needs a name on screen; the contract check reports the missing title.
      title: typeof shot.title === 'string' && shot.title.trim() !== '' ? shot.title : UNTITLED_SHOT,
      description: String(shot.description ?? ''),
    } as Shot;
  });
}

async function readVersionFiles(projectDir: string, slug: string, number: number): Promise<Version> {
  const reelDir = await requireReelDir(projectDir, slug);
  const versionDir = join(reelDir, `v${number}`);
  if (!Number.isInteger(number) || number < 1 || !(await isDirectory(versionDir))) {
    throw new KinottaError('not-found', `Version ${number} of reel "${slug}" not found.`);
  }
  // A version that breaks the contract still opens (S5): problems become issues, not errors.
  const { file: parsed, problem } = await readShotsFile(versionDir);
  const file = parsed ?? {};
  const page = await scanVersionPage(await readPage(versionDir), versionDir, projectDir);
  const fileCheck = checkShotsFile(parsed, problem);
  const hasDuration = !fileCheck.issues.some((i) => i.code === 'no-duration') && parsed !== null;
  const lastStart = Math.max(0, ...fileCheck.shots.map((s) => s.start));
  const pageEnd = Math.max(0, ...page.scenes.map((s) => s.start + s.duration));
  const duration = hasDuration ? Number(file.duration) : Math.max(lastStart, pageEnd);
  const { sections, shots } = readSections(file.sections, readShots(file.shots, duration), duration, (await readTitle(reelDir)) ?? slug);
  const version: Version = {
    number,
    isNewest: number === (await newestVersionNumber(reelDir)),
    duration,
    shots,
    overlays: listOf<Overlay>(file.overlays),
    sections,
    // A version with no readable shots.json gets that one issue; its page problems would only be noise.
    issues: parsed === null ? fileCheck.issues : [...fileCheck.issues, ...page.issues, ...checkShotsAgainstPage(fileCheck.shots, page.scenes)],
  };
  if (Array.isArray(file.changedSections)) version.changedSections = file.changedSections as string[];
  if (typeof file.builtBy === 'string' && file.builtBy.trim() !== '') version.builtBy = file.builtBy;
  if (await isCodeOnly(projectDir, reelDir)) version.code = { scenes: page.scenes.map((s) => s.name), offsets: await readEditsCss(versionDir) };
  const withFootage = await addFootage(projectDir, reelDir, versionDir, version);
  if (withFootage.shots.length > 0) return withFootage;
  return { ...withFootage, brollRequest: brollRequest(slug, (await readTitle(reelDir)) ?? slug, number) };
}

const readOrEmpty = (file: string): Promise<string> => readFile(file, 'utf8').catch(() => '');

/** The page of version n as text and its element-offset stylesheet, each empty when it has none (for comparing two versions). */
async function readPageText(reelDir: string, number: number): Promise<{ html: string; css: string }> {
  const dir = join(reelDir, `v${number}`);
  return { html: await readOrEmpty(join(dir, PAGE_FILE)), css: await readOrEmpty(join(dir, EDITS_CSS)) };
}

/**
 * A version as its files say it is, plus (from v2 on) which of its sections changed since the version before (F4).
 * Nothing here reads or writes the editor's state; the public read in carry.ts adds that.
 */
export async function readVersion(projectDir: string, slug: string, number: number): Promise<Version> {
  const version = await readVersionFiles(projectDir, slug, number);
  if (number < 2) return version;
  const reelDir = join(projectDir, REELS_DIR, slug);
  let previous: Version;
  try {
    previous = await readVersionFiles(projectDir, slug, number - 1);
  } catch {
    // The version before is missing or unreadable, so there is nothing to compare with.
    return version;
  }
  const { changed, claimMismatch } = detectChanges(
    { version: previous, ...(await readPageText(reelDir, number - 1)) },
    { version, ...(await readPageText(reelDir, number)) },
  );
  return { ...version, changedSections: changed, claimMismatch };
}
