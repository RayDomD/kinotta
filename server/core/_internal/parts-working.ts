import { createHash } from 'node:crypto';
import { applyOperations } from './edit-model.ts';
import { readEditListNow, workingSources, withReelLock } from './edit-list.ts';
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
  const edited = applyOperations(sources, list.operations.filter((op) => !list.flagged?.[op.id]));
  const manifest = override ? partsAlternateManifest(edited.plan.parts!, override) : edited.plan.parts!;
  const inputs = await readPartsInputs(reelDir, manifest);
  if (manifest.revisionHashes) assertPartsHashes(manifest.revisionHashes, await partsRevisionHashes(reelDir, manifest));
  const offsets = editsCss(offsetsOf(edited));
  const html = assembleParts(manifest, inputs).replace('</head>', `${offsets ? `<style>${offsets}</style>` : ''}</head>`);
  return { html, duration: manifest.duration, shots: checkPartsManifest(manifest as unknown as Record<string, unknown>).shots, key: createHash('sha256').update(html).digest('hex') };
}

export async function workingPartsPage(projectDir: string, slug: string, override?: PartsOverride): Promise<string> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    const snapshot = await workingPartsSnapshot(projectDir, slug, override);
    if (!snapshot) throw new KinottaError('invalid', 'This reel does not use parts.');
    return snapshot.html;
  });
}
