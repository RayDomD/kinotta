import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isCodeOnly } from './code-edits.ts';
import { readEditListNow, workingSources, withReelLock } from './edit-list.ts';
import { applyOperations, inputsVersion, workingOperations } from './edit-model.ts';
import { carryPartsAlternates } from './parts.ts';
import { KinottaError } from './errors.ts';
import { assertPublishedPartsUnchanged, partsRevisionHashes, readAuthoredParts, readPartsInputs } from './parts-files.ts';
import { newestVersionNumber, requireReelDir } from './version.ts';
import { publishVersion, stagePartsVersion } from './version-build.ts';
import type { BuiltPartsVersion, PartsManifest } from './types.ts';

const DEFAULT_BUILDER = 'Kinotta';

/** An agent build creates a new authored base, after the same atomic publication used by other versions. */
export async function buildParts(projectDir: string, slug: string, by = DEFAULT_BUILDER): Promise<BuiltPartsVersion> {
  const reelDir = await requireReelDir(projectDir, slug);
  return withReelLock(reelDir, async () => {
    if (typeof by !== 'string' || !by.trim()) throw new KinottaError('invalid', 'A build needs a non-empty author name.');
    if (!await isCodeOnly(projectDir, reelDir)) throw new KinottaError('invalid', 'Parts builds are for code-built reels. Footage reels keep their existing build path.');
    const list = await readEditListNow(projectDir, slug);
    const previous = await newestVersionNumber(reelDir);
    const old = previous ? applyOperations(await workingSources(projectDir, reelDir), workingOperations(list)).plan.parts : undefined;
    const authored = await readAuthoredParts(reelDir);
    const before = previous ? JSON.parse(await readFile(join(reelDir, `v${inputsVersion(list)}`, 'authored-shots.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return readFile(join(reelDir, `v${inputsVersion(list)}`, 'shots.json'), 'utf8');
    })) as PartsManifest : undefined;
    const manifest = carryPartsAlternates(authored, old, before);
    const inputs = await readPartsInputs(reelDir, manifest);
    const revisionHashes = await partsRevisionHashes(reelDir, manifest);
    await assertPublishedPartsUnchanged(reelDir, revisionHashes);
    const number = previous + 1;
    const staged = await stagePartsVersion(reelDir, { ...manifest, revisionHashes }, inputs, by.trim(), previous ? join(reelDir, `v${previous}`) : undefined);
    try { await writeFile(join(staged.dir, 'authored-shots.json'), JSON.stringify(authored), 'utf8'); }
    catch (error) { await rm(staged.dir, { recursive: true, force: true }); throw error; }
    await publishVersion(reelDir, staged, number);
    await readEditListNow(projectDir, slug);
    return { version: number, issues: [] };
  });
}
