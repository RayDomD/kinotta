import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyOperations, operationTouches } from './edit-model.ts';
import type { Operation, Plan, PlanClip, Sources } from './edit-model.ts';
import { EDIT_LIST_FILE, readEditList, withReelLock, writeJsonAtomic } from './edit-list.ts';
import { assertCodeOnlyOperations, changedScenes, codeSources, copyVersion, isCodeOnly, offsetsOf, writeEdits } from './code-edits.ts';
import { readReelPlan, readReelWords } from './sources.ts';
import { KinottaError } from './errors.ts';
import { pieceMap, toTimelineSpan } from './pieces.ts';
import type { SavedVersion, TranscriptWord } from './types.ts';
import { STAGE_DIR, publishVersion, stageVersion } from './version-build.ts';
import { newestVersionNumber, readVersion, requireReelDir } from './version.ts';

const BUILT_BY_YOU = 'you';
const SPAN_TOLERANCE = 1e-6;

/**
 * Why Save must wait because a comment batch is with an agent, or null. A stub: the hand-off (T41) fills it in, and
 * every Save already asks it first.
 */
async function batchOut(_reelDir: string): Promise<string | null> {
  return null;
}

const sameSpan = (a: { start: number; end: number } | null, b: { start: number; end: number } | null): boolean =>
  a === null || b === null ? a === b : Math.abs(a.start - b.start) < SPAN_TOLERANCE && Math.abs(a.end - b.end) < SPAN_TOLERANCE;

/** The stretches of a section's source range in the order the pieces play them (a cut inside one is not a break), as one string to compare. */
function playOrder(plan: Plan, start: number, end: number): string {
  const stretches: { from: number; to: number }[] = [];
  for (const p of pieceMap(plan.pieces, plan.duration ?? 0).pieces) {
    const from = Math.max(start, p.in);
    const to = Math.min(end, p.out);
    if (to - from <= SPAN_TOLERANCE) continue;
    const last = stretches[stretches.length - 1];
    if (last && Math.abs(last.to - from) < SPAN_TOLERANCE) last.to = to;
    else stretches.push({ from, to });
  }
  return stretches.map((r) => `${r.from.toFixed(4)}-${r.to.toFixed(4)}`).join(',');
}

/**
 * Whether a clip that changed (trimmed, slid, or gone) belongs to the section or plays over any of it, before or
 * after. The page comparison counts every scene that plays inside a section, so the claim has to as well.
 */
function clipsChanged(before: Plan, after: Plan, section: { id: string; start: number; end: number }): boolean {
  const was = new Map((before.clips ?? []).map((c) => [c.id, c]));
  const now = new Map((after.clips ?? []).map((c) => [c.id, c]));
  const plays = (clip: PlanClip | undefined): boolean => clip !== undefined && (clip.section === section.id || (clip.in < section.end && clip.out > section.start));
  return [...new Set([...was.keys(), ...now.keys()])].some((id) => JSON.stringify(was.get(id)) !== JSON.stringify(now.get(id)) && (plays(was.get(id)) || plays(now.get(id))));
}

/**
 * The sections the edits changed: one an operation touches, or whose place on the timeline moved or shrank. This is what
 * comparing the pages finds, so the claim in shots.json and the comparison agree.
 */
export function changedSectionsOf(before: Plan, after: Plan, operations: readonly Operation[]): string[] {
  const duration = before.duration ?? 0;
  const was = pieceMap(before.pieces, duration);
  const now = pieceMap(after.pieces, duration);
  return (after.sections ?? [])
    .filter((s) => operations.some((op) => operationTouches(op, s)) || clipsChanged(before, after, s) || playOrder(before, s.start, s.end) !== playOrder(after, s.start, s.end) || !sameSpan(toTimelineSpan(was, s.start, s.end), toTimelineSpan(now, s.start, s.end)))
    .map((s) => s.id);
}

/**
 * Save for a reel built from code: the next version is a copy of the newest plus `kinotta-edits.css`, which holds the
 * element offsets (the ones the newest version already had, with the list applied over them) and is linked from the copied
 * page. Built in the stage folder, `edits.json` then `shots.json` last, and renamed to `v<n+1>` in one step.
 */
async function saveCodeOnly(projectDir: string, slug: string, reelDir: string, list: { base: number; operations: readonly Operation[] }): Promise<SavedVersion> {
  assertCodeOnlyOperations(list.operations);
  const newest = await newestVersionNumber(reelDir);
  const from = join(reelDir, `v${newest}`);
  const { sources, scenes } = await codeSources(from);
  const edited = applyOperations(sources, list.operations);
  const stage = join(reelDir, STAGE_DIR);
  await rm(stage, { recursive: true, force: true });
  try {
    await copyVersion(from, stage);
    await writeEdits(stage, offsetsOf(edited));
    await writeFile(join(stage, 'edits.json'), `${JSON.stringify({ base: list.base, operations: list.operations }, null, 2)}
`, 'utf8');
    const shots = JSON.parse(await readFile(join(from, 'shots.json'), 'utf8')) as Record<string, unknown>;
    const sections = (await readVersion(projectDir, slug, newest)).sections;
    // A section changed when a scene whose offsets differ plays inside it: what comparing the pages finds too.
    const moved = new Set(changedScenes(offsetsOf(sources), offsetsOf(edited)));
    const spans = scenes.filter((s) => moved.has(s.name));
    const changedSections = sections.filter((sec) => spans.some((s) => s.start < sec.end && s.start + s.duration > sec.start)).map((sec) => sec.id);
    await writeFile(join(stage, 'shots.json'), `${JSON.stringify({ ...shots, changedSections, builtBy: BUILT_BY_YOU }, null, 2)}
`, 'utf8');
  } catch (err) {
    await rm(stage, { recursive: true, force: true });
    throw err;
  }
  const number = newest + 1;
  await publishVersion(reelDir, { dir: stage }, number);
  return { version: number };
}

/**
 * Save: writes the edit list into the reel's sources and builds the next version from them, with no agent. The version is
 * built in a stage folder and renamed to `v<n+1>` last, so any failure leaves no new version, the sources as they were,
 * and the edit list in place. On success the list is cleared.
 */
export async function saveEdits(projectDir: string, slug: string): Promise<SavedVersion> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const list = await readEditList(projectDir, slug);
    if (list.operations.length === 0) throw new KinottaError('invalid', 'There are no edits to save.');
    if (list.stale) throw new KinottaError('frozen', `The edit list was made on v${list.base}, which is no longer the newest version. Discard it to start again.`);
    const reason = await batchOut(reelDir);
    if (reason !== null) throw new KinottaError('invalid', reason);

    if (await isCodeOnly(projectDir, reelDir)) {
      const saved = await saveCodeOnly(projectDir, slug, reelDir, list);
      await rm(join(reelDir, EDIT_LIST_FILE), { force: true });
      return saved;
    }
    const { plan, planFile, planDir, transcriptFile } = await readReelPlan(projectDir, reelDir);
    const words = await readReelWords(transcriptFile);
    const edited: Sources = applyOperations({ plan, words }, list.operations);
    const number = (await newestVersionNumber(reelDir)) + 1;

    const staged = await stageVersion(reelDir, {
      plan: edited.plan,
      planDir,
      words: edited.words,
      builtBy: BUILT_BY_YOU,
      changedSections: changedSectionsOf(plan, edited.plan, list.operations),
      operations: { base: list.base, list: list.operations },
    });

    const oldPlan = await readFile(planFile, 'utf8');
    const oldTranscript = transcriptFile ? await readFile(transcriptFile, 'utf8') : null;
    try {
      await writeJsonAtomic(planFile, edited.plan);
      if (transcriptFile && JSON.stringify(edited.words) !== JSON.stringify(words)) await writeJsonAtomic(transcriptFile, { words: edited.words });
      await publishVersion(reelDir, staged, number);
    } catch (err) {
      await writeFile(planFile, oldPlan, 'utf8');
      if (transcriptFile && oldTranscript !== null) await writeFile(transcriptFile, oldTranscript, 'utf8');
      await rm(staged.dir, { recursive: true, force: true });
      throw err;
    }
    await rm(join(reelDir, EDIT_LIST_FILE), { force: true });
    return { version: number };
  });
}
