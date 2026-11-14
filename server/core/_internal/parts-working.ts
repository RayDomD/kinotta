import { readPinRecord } from './pin-files.ts';
import { pinnedEffectPage } from './pinned-effect-page.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readCapturedVersion } from './version.ts';
import { createHash } from 'node:crypto';
import { applyOperations, inputsVersion, workingOperations } from './edit-model.ts';
import { readEditListNow, workingSources, workingState, withReelLock } from './edit-list.ts';
import { editsCss, offsetsOf } from './code-edits.ts';
import { assembleParts, partsAlternateManifest } from './parts-assembler.ts';
import type { PartsOverride } from './parts-assembler.ts';
import { assertPartsHashes, partsRevisionHashes, readPartsInputs } from './parts-files.ts';
import { checkPartsManifest } from './parts.ts';
import { KinottaError } from './errors.ts';
import { requireReelDir } from './version.ts';

/** Caller holds the reel lock. No version is published for a Storyboard preview. */
export async function workingPartsSnapshot(projectDir: string, slug: string, override?: PartsOverride) {
  const reelDir = await requireReelDir(projectDir, slug);
  const list = await readEditListNow(projectDir, slug);
  const sources = await workingSources(projectDir, reelDir);
  if (!sources.plan.parts) return null;
  const edited = applyOperations(sources, workingOperations(list));
  const manifest = override ? partsAlternateManifest(edited.plan.parts!, override) : edited.plan.parts!;
  const inputs = await readPartsInputs(reelDir, manifest);
  if (manifest.revisionHashes) assertPartsHashes(manifest.revisionHashes, await partsRevisionHashes(reelDir, manifest));
  const offsets = editsCss(offsetsOf(edited));
  const html = pinnedEffectPage(assembleParts(manifest, inputs), edited.plan, checkPartsManifest(manifest as unknown as Record<string, unknown>).shots).replace('</head>', `${offsets ? `<style>${offsets}</style>` : ''}</head>`);
  return { html, duration: manifest.duration, shots: checkPartsManifest(manifest as unknown as Record<string, unknown>).shots, key: createHash('sha256').update(html).digest('hex') };
}

export async function workingEffectSnapshot(projectDir: string, slug: string) {
  const reelDir = await requireReelDir(projectDir, slug);
  const list = await readEditListNow(projectDir, slug);
  const history = await workingState(reelDir);
  const captured = await readPinRecord<import('./state.ts').StoredComment | null>(join(reelDir, `v${inputsVersion(list)}`, 'pin-comments.json'), 'pin comments');
  if (!list.operations.some((op) => op.kind === 'pin-comment') && !Object.keys(captured).length && !history.anchor?.sources.plan.pinComments) return null;
  const edited = applyOperations(await workingSources(projectDir, reelDir), workingOperations(list));
  if (!edited.plan.pinComments) return null;
  const used = inputsVersion(list);
  const baseDir = join(reelDir, `v${used}`);
  const version = await readCapturedVersion(projectDir, slug, used, baseDir);
  let html = pinnedEffectPage(await readFile(join(baseDir, 'index.html'), 'utf8'), edited.plan, version.shots);
  const offsets = editsCss(offsetsOf(edited));
  html = html.replace('</head>', `${offsets ? `<style>${offsets}</style>` : ''}</head>`);
  return { html, key: createHash('sha256').update(html).digest('hex') };
}

export async function workingPartsPage(projectDir: string, slug: string, override?: PartsOverride): Promise<string> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const snapshot = await workingPartsSnapshot(projectDir, slug, override) ?? await workingEffectSnapshot(projectDir, slug);
    if (!snapshot) throw new KinottaError('invalid', 'This reel does not use parts.');
    return snapshot.html;
  });
}
