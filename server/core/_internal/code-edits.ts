import { cp, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { CLIP_ROOT } from './edit-model.ts';
import type { ElementOffset, Operation, Sources } from './edit-model.ts';
import type { MediaPlan } from './media-model.ts';
import { scanPage } from './contract.ts';
import type { PageScene } from './contract.ts';
import { KinottaError } from './errors.ts';
import { readReelFootage } from './footage.ts';

/**
 * Code-only reels: a version that is a hand-written page with no footage and no plan. Kinotta cannot edit its timing,
 * only move and scale its named elements. Each such edit is stored as a CSS rule in `kinotta-edits.css` beside the
 * page, which the page links, so the agent's own code is never touched.
 */

/** The stylesheet a saved version carries, next to its `index.html`. */
export const EDITS_CSS = 'kinotta-edits.css';
export const MEDIA_SIDECAR_FILE = 'media.json';
const PAGE_FILE = 'index.html';
const REEL_PLAN_FILE = 'plan.json';
const HEADER = '/* Element moves made in Kinotta. Rewritten on each Save; edit them in Kinotta. */';
/** One rule per line, in the form this file writes: the scene root has no element part. */
const RULE = /^\[data-scene="([^"]+)"\](?: \[data-el="([^"]+)"\])? \{ (?:translate: (-?[\d.]+)px (-?[\d.]+)px; ?)?(?:scale: ([\d.]+); ?)?\}$/;

export type SceneOffsets = Record<string, Record<string, ElementOffset>>;

/** A reel with no footage and no plan of its own: built from code. */
export async function isCodeOnly(projectDir: string, reelDir: string): Promise<boolean> {
  const hasPlan = await readFile(join(reelDir, REEL_PLAN_FILE)).then(() => true, () => false);
  return !hasPlan && (await readReelFootage(projectDir, reelDir)) === null;
}

/** The offsets a stylesheet holds, by scene and element (`CLIP_ROOT` for the scene itself). Lines not in this file's own form are ignored. */
export function parseEditsCss(css: string): SceneOffsets {
  const found: SceneOffsets = {};
  for (const line of css.split('\n')) {
    const m = RULE.exec(line.trim());
    if (!m) continue;
    const [, scene, element, x, y, scale] = m;
    (found[scene!] ??= {})[element ?? CLIP_ROOT] = { x: Number(x ?? 0), y: Number(y ?? 0), scale: Number(scale ?? 1) };
  }
  return found;
}

const isHome = (o: ElementOffset): boolean => o.x === 0 && o.y === 0 && o.scale === 1;

/** The stylesheet for a set of offsets, in the engine's form (translate and scale, only what is off home), or null when none is. */
export function editsCss(offsets: SceneOffsets): string | null {
  const rules: string[] = [];
  for (const [scene, elements] of Object.entries(offsets)) {
    for (const [element, o] of Object.entries(elements)) {
      if (isHome(o)) continue;
      const selector = element === CLIP_ROOT ? `[data-scene="${scene}"]` : `[data-scene="${scene}"] [data-el="${element}"]`;
      const props = `${o.x || o.y ? `translate: ${o.x}px ${o.y}px; ` : ''}${o.scale !== 1 ? `scale: ${o.scale}; ` : ''}`;
      rules.push(`${selector} { ${props}}`);
    }
  }
  return rules.length > 0 ? `${HEADER}\n${rules.join('\n')}\n` : null;
}

/** The offsets a version folder's stylesheet holds; none when it has no stylesheet. */
export async function readEditsCss(versionDir: string): Promise<SceneOffsets> {
  return parseEditsCss(await readFile(join(versionDir, EDITS_CSS), 'utf8').catch(() => ''));
}

/** The page's scenes and the offsets already saved, as the edit model's sources: each scene stands in as a clip so the same operation applies. */
export async function codeSources(versionDir: string): Promise<{ sources: Sources; scenes: PageScene[] }> {
  const html = await readFile(join(versionDir, PAGE_FILE), 'utf8').catch(() => null);
  const { scenes } = scanPage(html);
  if (scenes.length === 0) throw new KinottaError('invalid', 'This version has no scenes to edit.');
  const saved = await readEditsCss(versionDir);
  const clips = scenes.map((s) => ({ id: s.name, in: s.start, out: s.start + s.duration, ...(saved[s.name] ? { offsets: saved[s.name] } : {}) }));
  const shots = JSON.parse(await readFile(join(versionDir, 'shots.json'), 'utf8')) as { duration: number };
  const sidecar = await readFile(join(versionDir, MEDIA_SIDECAR_FILE), 'utf8').catch(() => null);
  const media = sidecar ? (JSON.parse(sidecar) as { media: MediaPlan }).media : undefined;
  return { sources: { plan: { clips, duration: shots.duration, ...(media ? { media } : {}) }, words: [] }, scenes };
}

/** Throws `invalid` unless every operation is a move or scale of an element, the only edit a reel built from code takes. */
export function assertCodeOnlyOperations(operations: readonly Operation[]): void {
  const allowed = new Set(['element-offset', 'track-add', 'track-change', 'track-move', 'track-remove', 'placement-add', 'placement-change', 'placement-remove', 'placement-replace', 'word-text', 'word-timing', 'phrase-text']);
  if (operations.some((op) => !allowed.has(op.kind) || ((op.kind === 'placement-add' || op.kind === 'placement-replace') && op.placement.role !== 'audio'))) {
    throw new KinottaError('invalid', 'This reel is built from code, so only elements can be moved or scaled. To change its timing, ask your agent for a new version.');
  }
}

/** The offsets of a code-only version's sources, by scene. */
export function offsetsOf(sources: Sources): SceneOffsets {
  const found: SceneOffsets = {};
  for (const clip of sources.plan.clips ?? []) if (clip.offsets) found[clip.id] = clip.offsets;
  return found;
}

/** Whether the scenes' offsets differ between two sets, by scene. */
export function changedScenes(before: SceneOffsets, after: SceneOffsets): string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  const canon = (o: Record<string, ElementOffset> | undefined): string => JSON.stringify(Object.entries(o ?? {}).filter(([, v]) => !isHome(v)).sort(([a], [b]) => (a < b ? -1 : 1)));
  return [...names].filter((n) => canon(before[n]) !== canon(after[n]));
}

/** The page with the stylesheet linked in its head (once), or as it was when it already links it. */
export function linkEdits(html: string): string {
  if (html.includes(EDITS_CSS)) return html;
  const link = `<link rel="stylesheet" href="${EDITS_CSS}">`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${link}\n</head>`) : `${link}\n${html}`;
}

/** The rules of a stylesheet that name `scene`, as one string, for judging whether a scene's look changed. */
export function rulesFor(css: string, scene: string): string {
  return css
    .split('\n')
    .filter((line) => line.startsWith(`[data-scene="${scene}"]`))
    .join('\n');
}

/**
 * What sits in a version folder besides the page and its assets, by name: the version's own record (`shots.json`, written last, and
 * `edits.json`, written fresh), the agent's notes (`answers.md`), the comment batches Kinotta wrote when one was copied, and the version's approval.
 */
const PER_VERSION_FILE = /^(shots\.json|edits\.json|answers\.md|comments(-.+)?\.json|approval\.json)$/;

/** Copies a version folder to `dir`: the page and its assets, none of the per-version records above. */
export async function copyVersion(from: string, dir: string): Promise<void> {
  await cp(from, dir, { recursive: true, filter: (src) => resolve(dirname(src)) !== resolve(from) || !PER_VERSION_FILE.test(basename(src)) });
}

/** Writes the stylesheet and links it from the copied page. */
export async function writeEdits(dir: string, offsets: SceneOffsets): Promise<void> {
  const css = editsCss(offsets);
  if (css === null) {
    // Every offset is back home: a stylesheet the copied page already links stays, empty, so the link is not left dangling.
    if (await readFile(join(dir, EDITS_CSS)).then(() => true, () => false)) await writeFile(join(dir, EDITS_CSS), `${HEADER}\n`, 'utf8');
    return;
  }
  await writeFile(join(dir, EDITS_CSS), css, 'utf8');
  const page = join(dir, PAGE_FILE);
  await writeFile(page, linkEdits(await readFile(page, 'utf8')), 'utf8');
}
