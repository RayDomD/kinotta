import { parse } from 'node-html-parser';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ContractIssue } from './types.ts';

/**
 * The static contract check (ADR 0001, S5). Every rule, with the `code` it reports under:
 *
 *   shots-file        shots.json is missing, not valid JSON, or not an object
 *   no-duration       shots.json has no numeric duration
 *   no-shot-list      shots.json has no list of shots
 *   shot-field        a shot has no number, no start time, or no title
 *   duplicate-shot    two shots share a number
 *   shot-order        shot starts are not ascending
 *   shot-after-end    a shot starts at or after the reel's duration
 *   no-page           the version has no index.html
 *   no-scenes         the page has no scene with numeric data-start and data-duration
 *   scene-timing      a scene's data-start or data-duration is missing or not a number
 *   scene-gap         no scene covers a shot's start
 *   no-named-elements the scenes covering a shot have no data-el
 *   duplicate-element a data-el name is used twice in one scene
 *   page-sound        the page plays sound of its own, outside the shared mix (ADR 0005): an audio element, an
 *                     unmuted video element, or a script making sound (new Audio, AudioContext, speechSynthesis).
 *                     Inline scripts and readable local scripts, including literal module imports.
 *
 * Problems are returned, never thrown: a broken version still opens.
 */

/** Tolerance when comparing a shot start to a scene's span, so 3.6 lands in a scene that starts at 3.6. */
const EPSILON = 1e-6;

export interface PageScene {
  name: string;
  start: number;
  duration: number;
  /** Every `data-el` value inside the scene, in document order. */
  elements: string[];
}

export interface PageScan {
  /** Scenes with numeric timing. */
  scenes: PageScene[];
  issues: ContractIssue[];
}

/** The timing a `data-*` attribute holds, or null when it is missing or not a number. */
function numeric(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Script calls that make sound in the browser. A timeline's own `.play()` makes none, so it is not one of them. */
const SOUND_SCRIPTS: ReadonlyArray<[RegExp, string]> = [
  [/\bnew\s+Audio\s*\(/, 'new Audio'],
  [/\b(?:webkit)?AudioContext\b/, 'AudioContext'],
  [/\bspeechSynthesis\b/, 'speechSynthesis'],
];

/** What on a page makes sound the editor and the render never hear, or null when nothing does (AM42). */
function pageSound(root: ReturnType<typeof parse>, localScripts: string[]): string | null {
  const found: string[] = [];
  if (root.querySelector('audio')) found.push('an audio element');
  if (root.querySelectorAll('video').some((video) => !video.hasAttribute('muted'))) found.push('an unmuted video element');
  const scripts = [...root.querySelectorAll('script').map((script) => script.text), ...localScripts].join('\n');
  for (const [pattern, name] of SOUND_SCRIPTS) if (pattern.test(scripts)) found.push(name);
  return found.length > 0 ? found.join(', ') : null;
}

const secs = (n: number): string => `${Number(n.toFixed(2))}s`;
const times = (n: number): string => (n === 2 ? 'twice' : `${n} times`);

/** Reads the scene markup of a version page. `html` is null when the version has no index.html. */
export function scanPage(html: string | null, localScripts: string[] = []): PageScan {
  if (html === null) return { scenes: [], issues: [{ code: 'no-page', message: 'the version has no index.html' }] };
  const scenes: PageScene[] = [];
  const issues: ContractIssue[] = [];
  const root = parse(html);
  const found = root.querySelectorAll('[data-scene]');
  for (const [i, node] of found.entries()) {
    const name = node.getAttribute('data-scene')?.trim() || `#${i + 1}`;
    const start = numeric(node.getAttribute('data-start'));
    const duration = numeric(node.getAttribute('data-duration'));
    if (start === null || duration === null) {
      issues.push({ code: 'scene-timing', scene: name, message: `scene ${name}: data-start or data-duration is missing or not a number` });
      continue;
    }
    const elements = node.querySelectorAll('[data-el]').map((el) => el.getAttribute('data-el')?.trim() ?? '');
    scenes.push({ name, start, duration, elements });
    const counts = new Map<string, number>();
    for (const el of elements) counts.set(el, (counts.get(el) ?? 0) + 1);
    for (const [el, count] of counts) {
      if (count > 1) issues.push({ code: 'duplicate-element', scene: name, message: `scene ${name}: element name "${el}" is used ${times(count)}` });
    }
  }
  if (scenes.length === 0) {
    issues.unshift({ code: 'no-scenes', message: 'the page has no scenes with data-start and data-duration' });
  }
  const sound = pageSound(root, localScripts);
  if (sound !== null) {
    issues.push({ code: 'page-sound', message: `the page plays its own sound (${sound}), which preview, Save and render leave out. Add the sound as a project source so it joins the shared mix.` });
  }
  return { scenes, issues };
}

/** Static module paths. Runtime-built imports and remotely loaded code cannot be inspected here. */
const SCRIPT_IMPORT = /\b(?:from\s*|import\s*\(\s*|import\s+)(["'`])([^"'`$]+)\1/g;

/** Check a saved page's local script graph without executing code or reading outside the project. */
export async function scanVersionPage(html: string | null, versionDir: string, projectDir: string): Promise<PageScan> {
  if (html === null) return scanPage(html);
  const scripts: string[] = [];
  const seen = new Set<string>();
  async function readScript(reference: string, base: string): Promise<void> {
    if (/^(?:[a-z]+:|\/\/|\/|#)/i.test(reference)) return;
    const file = resolve(base, reference.split(/[?#]/)[0]!);
    const path = relative(projectDir, file);
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`) || seen.has(file)) return;
    seen.add(file);
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text === null) return;
    scripts.push(text);
    for (const match of text.matchAll(SCRIPT_IMPORT)) await readScript(match[2]!, dirname(file));
  }
  for (const script of parse(html).querySelectorAll('script')) {
    const src = script.getAttribute('src');
    if (src) await readScript(src, versionDir);
    else for (const match of script.text.matchAll(SCRIPT_IMPORT)) await readScript(match[2]!, versionDir);
  }
  return scanPage(html, scripts);
}

interface ReadShot {
  number: string;
  start: number;
}

/** The shot list of a parsed shots.json, and the problems found reading it. */
export function checkShotsFile(file: Record<string, unknown> | null, problem: string | null): { issues: ContractIssue[]; shots: ReadShot[] } {
  const issues: ContractIssue[] = [];
  if (file === null) {
    return { issues: [{ code: 'shots-file', message: `shots.json: ${problem ?? 'could not be read'}` }], shots: [] };
  }
  const duration = Number(file.duration);
  const hasDuration = file.duration !== undefined && file.duration !== null && file.duration !== '' && Number.isFinite(duration);
  if (!hasDuration) issues.push({ code: 'no-duration', message: 'shots.json: no duration' });
  if (!Array.isArray(file.shots)) {
    issues.push({ code: 'no-shot-list', message: 'shots.json: no list of shots' });
    return { issues, shots: [] };
  }

  const shots: ReadShot[] = [];
  const seen = new Set<string>();
  let ordered = true;
  let previous = -Infinity;
  for (const [i, raw] of (file.shots as unknown[]).entries()) {
    const shot = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const number = typeof shot.number === 'string' && shot.number.trim() !== '' ? shot.number : typeof shot.number === 'number' ? String(shot.number) : null;
    const which = number === null ? `shot ${i + 1} in the list` : `shot ${number}`;
    const at = { ...(number === null ? {} : { shot: number }) };
    if (number === null) issues.push({ code: 'shot-field', message: `shots.json: ${which} has no number` });
    const start = shot.start === undefined || shot.start === null || shot.start === '' ? Number.NaN : Number(shot.start);
    if (!Number.isFinite(start)) issues.push({ code: 'shot-field', ...at, message: `shots.json: ${which} has no start time` });
    if (typeof shot.title !== 'string' || shot.title.trim() === '') {
      issues.push({ code: 'shot-field', ...at, message: `shots.json: ${which} is missing a title` });
    }
    if (number === null || !Number.isFinite(start)) continue;
    if (seen.has(number)) {
      issues.push({ code: 'duplicate-shot', shot: number, message: `shots.json: shot number ${number} is used twice` });
      continue;
    }
    seen.add(number);
    if (start < previous) ordered = false;
    previous = start;
    if (hasDuration && start >= duration) {
      issues.push({ code: 'shot-after-end', shot: number, message: `shot ${number}: starts at ${secs(start)}, at or after the end of the reel (${secs(duration)})` });
    }
    shots.push({ number, start });
  }
  if (!ordered) issues.push({ code: 'shot-order', message: 'shots.json: shots are not in time order' });
  return { issues, shots };
}

/** Whether each shot's start is covered by a scene, and whether the scenes covering it have named elements. */
export function checkShotsAgainstPage(shots: ReadShot[], scenes: PageScene[]): ContractIssue[] {
  if (scenes.length === 0) return [];
  const issues: ContractIssue[] = [];
  for (const shot of shots) {
    const covering = scenes.filter((s) => shot.start >= s.start - EPSILON && shot.start < s.start + s.duration - EPSILON);
    if (covering.length === 0) {
      issues.push({ code: 'scene-gap', shot: shot.number, message: `shot ${shot.number}: starts at ${secs(shot.start)} but no scene covers that time` });
    } else if (covering.every((s) => s.elements.length === 0)) {
      issues.push({ code: 'no-named-elements', shot: shot.number, scene: covering[0]!.name, message: `shot ${shot.number}: no named elements` });
    }
  }
  return issues;
}
