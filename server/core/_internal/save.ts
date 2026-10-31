import { pinnedEffectPage } from './pinned-effect-page.ts';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILT_BY_YOU, applyOperations, describeOperation, inputsVersion, operationTouches, workingOperations } from './edit-model.ts';
import type { Operation, Plan, PlanClip, Sources } from './edit-model.ts';
import { readEditListNow, recordFreeze, workingInputs, workingState, withoutFlagged, withPreservedMediaHashes, withReelLock, writeJsonAtomic } from './edit-list.ts';
import { contentIdentity } from './content-identity.ts';
import { MEDIA_SIDECAR_FILE, assertCodeOnlyOperations, changedScenes, codeSources, copyVersion, isCodeOnly, offsetsOf, sceneForShot, stillTime, writeEdits, writeSceneTiming } from './code-edits.ts';
import { freezePageDependencies } from './graphic-preservation.ts';
import { preserveMedia } from './media-preservation.ts';
import { withSpeech } from './media-speech.ts';
import { mediaWithTracks } from './media-model.ts';
import { beginSave, endSave } from './save-journal.ts';
import { settleNewest } from './carry.ts';
import { KinottaError } from './errors.ts';
import { pieceMap, toTimelineSpan } from './pieces.ts';
import type { EditList, SavedVersion, SkippedEdit } from './types.ts';
import { STAGE_DIR, publishVersion, snapshotLegacyVersion, stageVersion } from './version-build.ts';
import { newestVersionNumber, readVersion, requireReelDir } from './version.ts';
import { checkPartsManifest } from './parts.ts';
import { assembleParts } from './parts-assembler.ts';
import { assertPartsHashes, partsRevisionHashes, readPartsInputs } from './parts-files.ts';
import { DRAFT_OWNER_FILE } from './render-queue.ts';

interface CaptureOptions {
  locked?: boolean;
  reason?: string;
  capture?: (dir: string) => Promise<SavedVersion>;
  validate?: (dir: string, version: number) => Promise<void>;
}

const SPAN_TOLERANCE = 1e-6;

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
  if (before.media || after.media) return JSON.stringify(before) === JSON.stringify(after) ? [] : (after.sections ?? []).map((s) => s.id);
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
async function freezeCodeOnly(projectDir: string, slug: string, reelDir: string, list: { base: number; operations: readonly Operation[] }, skipped: readonly SkippedEdit[], options: CaptureOptions = {}): Promise<SavedVersion> {
  assertCodeOnlyOperations(list.operations);
  const newest = await newestVersionNumber(reelDir);
  const from = join(reelDir, `v${list.base}`);
  const { sources, scenes } = await codeSources(from);
  const shots = JSON.parse(await readFile(join(from, 'shots.json'), 'utf8')) as Record<string, unknown>;
  const parts = shots.contract === 2 ? checkPartsManifest(shots).manifest : null;
  if (shots.contract === 2 && !parts) throw new KinottaError('invalid', 'The parts manifest must pass check before it can be saved in a version.');
  const applied = await withPreservedMediaHashes(reelDir, applyOperations(sources, list.operations));
  const edited = applied.plan.media ? { ...applied, plan: { ...applied.plan, media: mediaWithTracks(applied.plan.media) } } : applied;
  const stage = join(reelDir, STAGE_DIR);
  await rm(stage, { recursive: true, force: true });
  try {
    await copyVersion(from, stage);
    // Files the page uses from outside its version folder are frozen too, so the new version cannot change later (AM33).
    if (parts) {
      const workingManifest = edited.plan.parts ?? parts;
      const inputs = await readPartsInputs(reelDir, workingManifest);
      if (parts.revisionHashes) assertPartsHashes(parts.revisionHashes, await partsRevisionHashes(reelDir, parts));
      const nextShots = workingManifest.shots.map((shot) => {
        const clip = edited.plan.clips?.find((clip) => clip.id === shot.name);
        return clip ? { ...shot, duration: clip.out - clip.in } : shot;
      });
      const next = { ...workingManifest, shots: nextShots, duration: nextShots.reduce((sum, shot) => sum + shot.duration, 0) };
      Object.assign(shots, next);
      await writeFile(join(stage, 'index.html'), assembleParts(next, inputs), 'utf8');
    } else await freezePageDependencies(stage);
    if (edited.plan.pinComments) {
      await writeJsonAtomic(join(stage, 'pin-comments.json'), edited.plan.pinComments);
      const pageFile = join(stage, 'index.html');
      const pinnedShots = parts ? checkPartsManifest(shots).shots : scenes.map((scene, index) => ({ number: String(index + 1).padStart(2, '0'), name: scene.name, start: scene.start, duration: scene.duration, title: scene.name, description: '' }));
      await writeFile(pageFile, pinnedEffectPage(await readFile(pageFile, 'utf8'), edited.plan, pinnedShots), 'utf8');
    }
    await writeEdits(stage, offsetsOf(edited));
    if (!parts) await writeSceneTiming(stage, sources, edited);
    if (edited.plan.media) {
      const media = await preserveMedia(from, stage, await withSpeech(projectDir, from, edited.plan.media), options.capture !== undefined);
      await writeJsonAtomic(join(stage, MEDIA_SIDECAR_FILE), { media, duration: edited.plan.duration });
    }
    await writeFile(join(stage, 'edits.json'), `${JSON.stringify({ base: list.base, operations: list.operations }, null, 2)}
`, 'utf8');
    const sections = (await readVersion(projectDir, slug, newest)).sections;
    // A section changed when a scene whose offsets differ plays inside it: what comparing the pages finds too.
    const moved = new Set(changedScenes(offsetsOf(sources), offsetsOf(edited)));
    for (const clip of edited.plan.clips ?? []) {
      const before = sources.plan.clips?.find((c) => c.id === clip.id);
      if (before?.in !== clip.in || before?.out !== clip.out) moved.add(clip.id);
    }
    const spans = scenes.filter((s) => moved.has(s.name));
    const changedSections = sections.filter((sec) => spans.some((s) => s.start < sec.end && s.start + s.duration > sec.start) || (edited.plan.clips ?? []).some((c) => moved.has(c.id) && c.in < sec.end && c.out > sec.start)).map((sec) => sec.id);
    const timingChanged = list.operations.some((op) => op.kind === 'clip-slide' || op.kind === 'clip-trim');
    if (timingChanged && !parts) {
      shots.duration = edited.plan.duration;
      shots.shots = (shots.shots as { start: number; title: string; scene?: string }[]).map((shot) => {
        const scene = sceneForShot(shot, scenes);
        const clip = edited.plan.clips?.find((c) => c.id === scene?.name);
        return scene && clip ? { ...shot, scene: clip.id, start: stillTime(shot.start, scene, clip) } : shot;
      }).sort((a, b) => a.start - b.start);
    }
    await writeFile(join(stage, 'shots.json'), `${JSON.stringify({ ...shots, changedSections, builtBy: BUILT_BY_YOU }, null, 2)}
`, 'utf8');
  } catch (err) {
    await rm(stage, { recursive: true, force: true });
    throw err;
  }
  if (options.reason) {
    const file = join(stage, 'shots.json');
    await writeJsonAtomic(file, { ...JSON.parse(await readFile(file, 'utf8')), frozenBy: options.reason });
  }
  if (options.capture) return options.capture(stage);
  try { await options.validate?.(stage, newest + 1); } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  if (await contentIdentity(stage) === await contentIdentity(join(reelDir, `v${newest}`))) {
    await rm(stage, { recursive: true, force: true });
    return { version: newest };
  }
  const number = newest + 1;
  try {
    await beginSave(reelDir, number, [], list.operations.map((op) => op.id), withoutFlagged(await workingState(reelDir), skipped, number));
    await publishVersion(reelDir, { dir: stage }, number);
  } catch (failure) {
    await endSave(reelDir);
    await rm(stage, { recursive: true, force: true });
    throw failure;
  }
  await settleNewest(projectDir, slug);
  return { version: number };
}

/** The edits a save leaves out because they no longer apply, named by what they did and the shot they acted at. */
function staleEdits(list: EditList): SkippedEdit[] {
  return list.operations
    .filter((op) => list.flagged?.[op.id] !== undefined)
    .map((op) => ({ id: op.id, text: describeOperation(op).text, ...list.flaggedAt?.[op.id] }));
}

/**
 * Capture the anchored working inputs under the reel lock. Publish only changed content,
 * with one stage-and-rename boundary and a journal that retains the full undo/redo history.
 */
async function buildWorking(projectDir: string, slug: string, options: CaptureOptions = {}): Promise<SavedVersion> {
  const reelDir = await requireReelDir(projectDir, slug);
  const task = async (): Promise<SavedVersion> => {
    const list = await readEditListNow(projectDir, slug);
    if ((await newestVersionNumber(reelDir)) === 0) throw new KinottaError('invalid', 'This reel has no version yet. Working renders wait until its transcript is done and v1 is built. Edits still collect.');
    if (list.stale) throw new KinottaError('frozen', `The edit list was made on v${list.base}, which is no longer the newest version. Check its flagged edits before saving it.`);
    // An edit that no longer applies is left out, not a reason to refuse. Undo brings it back, flagged. A Draft changes nothing, so it records no skip.
    const skipped = options.capture ? [] : staleEdits(list);
    const applying = workingOperations(list);
    // What the version records is what it applied, on the inputs it applied them to, so its edit list replays to the same result.
    const applied = { base: inputsVersion(list), operations: applying };
    const result = (version: number): SavedVersion => ({ version, ...(skipped.length > 0 ? { skipped } : {}) });

    if (await isCodeOnly(projectDir, reelDir)) {
      const saved = await freezeCodeOnly(projectDir, slug, reelDir, applied, skipped, options);
      if (options.capture) return saved;
      await recordFreeze(reelDir, saved.version, withoutFlagged(await workingState(reelDir), skipped, saved.version), await contentIdentity(join(reelDir, `v${saved.version}`)));
      await endSave(reelDir);
      await settleNewest(projectDir, slug);
      return result(saved.version);
    }
    const { sources, planDir, transcript } = await workingInputs(projectDir, reelDir);
    const { plan, words } = sources;
    const edit: Sources = await withPreservedMediaHashes(reelDir, applyOperations(sources, applying));
    const edited: Sources = edit.plan.media ? { ...edit, plan: { ...edit.plan, media: await withSpeech(projectDir, planDir, mediaWithTracks(edit.plan.media)) } } : edit;
    const number = (await newestVersionNumber(reelDir)) + 1;

    const staged = await stageVersion(reelDir, {
      freezeSources: true,
      referenceVideo: options.capture !== undefined,
      plan: edited.plan,
      planDir,
      words: edited.words,
      transcript,
      builtBy: BUILT_BY_YOU,
      changedSections: changedSectionsOf(plan, edited.plan, applying),
      operations: { base: applied.base, list: applying },
    });

    if (options.reason) {
      const file = join(staged.dir, 'shots.json');
      await writeJsonAtomic(file, { ...JSON.parse(await readFile(file, 'utf8')), frozenBy: options.reason });
    }
    if (options.capture) return options.capture(staged.dir);
    try { await options.validate?.(staged.dir, number); } catch (error) {
      await rm(staged.dir, { recursive: true, force: true });
      throw error;
    }
    const identity = await contentIdentity(staged.dir);
    const stored = await workingState(reelDir);
    // Against Working as stored: its inputs already carry cached words, so that alone would hide new speech.
    const storedSources = (await workingInputs(projectDir, reelDir, { cachedSpeech: false })).sources.plan.media?.sources ?? [];
    const capturesSpeech = edited.plan.media?.sources.some((source) => source.words && !(edit.plan.media?.sources.find((original) => original.id === source.id)?.words && storedSources.find((original) => original.id === source.id)?.words)) ?? false;
    // No edits means unchanged only on the newest inputs; a used version is a change even with nothing after it.
    if (((applying.length === 0 && applied.base === list.base && list.frozen === undefined && !capturesSpeech) || identity === (stored.frozenIdentity ?? await contentIdentity(join(reelDir, `v${number - 1}`))))) {
      await rm(staged.dir, { recursive: true, force: true });
      await recordFreeze(reelDir, number - 1, withoutFlagged(stored, skipped, number - 1), identity);
      return result(number - 1);
    }

    try {
      if (!plan.media && edited.plan.media) await snapshotLegacyVersion(planDir, join(reelDir, `v${applied.base}`), plan, { ...transcript, words });
      await beginSave(reelDir, number, [], applying.map((op) => op.id), withoutFlagged(await workingState(reelDir), skipped, number));
      await publishVersion(reelDir, staged, number);
    } catch (error) {
      await endSave(reelDir);
      await rm(staged.dir, { recursive: true, force: true });
      throw error;
    }
    await recordFreeze(reelDir, number, withoutFlagged(await workingState(reelDir), skipped, number), identity);
    await endSave(reelDir);
    await settleNewest(projectDir, slug);
    return result(number);
  };
  return options.locked ? task() : withReelLock(reelDir, task);
}

/** Preserve the current working reel without consuming its operation history. */
export const freezeEdits = (projectDir: string, slug: string, validate?: CaptureOptions['validate'], reason?: string): Promise<SavedVersion> => buildWorking(projectDir, slug, { validate, reason });

/** A queue owns this immutable capture until completion, failure or cancellation. */
export async function captureWorking(projectDir: string, slug: string): Promise<{ dir: string; version: number }> {
  const reelDir = await requireReelDir(projectDir, slug);
  const dir = join(reelDir, `.draft-${randomUUID()}`);
  const captured = await buildWorking(projectDir, slug, { capture: async (stage) => {
    try {
      // Publish ownership with the capture, so another server never sees an unowned live Draft.
      await writeFile(join(stage, DRAFT_OWNER_FILE), String(process.pid));
      await rename(stage, dir);
    } catch (error) {
      await rm(stage, { recursive: true, force: true });
      throw error;
    }
    return { version: await newestVersionNumber(reelDir) };
  } });
  return { dir, version: captured.version };
}

/** The hand-off holds the reel lock through capture, mapping and batch recording. */
export const freezeEditsNow = (projectDir: string, slug: string): Promise<SavedVersion> => buildWorking(projectDir, slug, { locked: true, reason: 'Comments to the agent' });
