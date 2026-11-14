import { readPinRecord } from './pin-files.ts';
import { pinnedEffectPage } from './pinned-effect-page.ts';
import { readFile } from 'node:fs/promises';
import { checkPartsManifest } from './parts.ts';
import { partsAlternateManifest } from './parts-assembler.ts';
import { join } from 'node:path';
import { editsCss, readEditsCss } from './code-edits.ts';
import { assembleParts } from './parts-assembler.ts';
import { readPartsInputs } from './parts-files.ts';
import { KinottaError } from './errors.ts';
import { readVersion, requireReelDir } from './version.ts';

const pages = new Map<string, string>();

/** Frozen alternate pages share the version's offsets and immutable assets, without modifying its selected page. */
export async function alternatePage(projectDir: string, slug: string, number: number, shot: string, revision: string): Promise<string> {
  const reelDir = await requireReelDir(projectDir, slug);
  const version = await readVersion(projectDir, slug, number);
  if (!version.parts) throw new KinottaError('invalid', 'Alternates are available only on parts reels.');
  if (version.issues.length) throw new KinottaError('invalid', version.issues.map((issue) => issue.message).join('\n'));
  const key = JSON.stringify([projectDir, slug, number, shot, revision]);
  const cached = pages.get(key);
  if (cached !== undefined) return cached;
  const html = assembleParts(version.parts, await readPartsInputs(reelDir, version.parts), { shot, revision });
  const offsets = editsCss(await readEditsCss(join(reelDir, `v${number}`)));
  const pinComments = await readPinRecord<import('./state.ts').StoredComment | null>(join(reelDir, `v${number}`, 'pin-comments.json'), 'pin comments');
  const alternate = partsAlternateManifest(version.parts, { shot, revision });
  const page = pinnedEffectPage(html, { pinComments }, checkPartsManifest(alternate as unknown as Record<string, unknown>).shots).replace('</head>', `${offsets ? `<style>${offsets}</style>` : ''}</head>`);
  pages.set(key, page);
  return page;
}
