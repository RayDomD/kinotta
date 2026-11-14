import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { KinottaError } from './errors.ts';
import { mediaTimeline } from './media-model.ts';
import type { MediaPlan } from './media-model.ts';

const MEDIA_DIR = 'media';

/** Preserve originals inside the unpublished stage. Hash the copied bytes so changed inputs cannot masquerade as relinks. */
export async function preserveMedia(planDir: string, stageDir: string, media: MediaPlan, referenceVideo = false): Promise<MediaPlan> {
  const broken = mediaTimeline(media).placements.find((p) => p.attachmentBroken);
  if (broken) throw new KinottaError('invalid', `Placement ${broken.id} has a broken footage attachment. Repair it or choose Stay at time before Save.`);
  const folder = join(stageDir, MEDIA_DIR);
  await mkdir(folder, { recursive: true });
  const sources = [];
  for (const [index, source] of media.sources.entries()) {
    const partial = join(folder, `.incoming-${index}`);
    const referenced = referenceVideo && source.kind === 'video';
    const original = resolve(planDir, source.path);
    try {
      if (!referenced) await copyFile(original, partial);
    } catch {
      throw new KinottaError('invalid', `Source ${source.id} could not be preserved. Relink the exact original or retry Save.`);
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(referenced ? original : partial)) hash.update(chunk as Buffer);
    const contentHash = hash.digest('hex');
    if (source.contentHash && source.contentHash !== contentHash) throw new KinottaError('invalid', `Source ${source.id} changed. Relink the exact original or replace it with a new source.`);
    if (referenced) {
      sources.push({ ...source, contentHash, path: relative(stageDir, original).split(sep).join('/') });
      continue;
    }
    const extension = extname(source.path).toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(extension)) throw new KinottaError('invalid', `Source ${source.id} needs a media file extension.`);
    const name = `${contentHash}${extension}`;
    // Reusing identical content inside the stage does not overwrite any published version.
    await rm(join(folder, name), { force: true });
    await rename(partial, join(folder, name));
    sources.push({ ...source, contentHash, path: `${MEDIA_DIR}/${name}` });
  }
  const { legacy: _legacy, ...rest } = media;
  return { ...rest, sources };
}

/** The exact originals a frozen version keeps, by durable source identity. */
export async function preservedSourceHashes(versionDir: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const name of ['plan.json', 'media.json']) {
    const text = await readFile(join(versionDir, name), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (text === null) continue;
    const saved = JSON.parse(text) as { media?: MediaPlan };
    for (const source of saved.media?.sources ?? []) if (source.contentHash) hashes[source.id] = source.contentHash;
  }
  return hashes;
}
