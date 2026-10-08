import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { KinottaError } from './errors.ts';
import { mediaTimeline } from './media-model.ts';
import type { MediaPlan } from './media-model.ts';

const MEDIA_DIR = 'media';

/** Preserve originals inside the unpublished stage. Hash the copied bytes so changed inputs cannot masquerade as relinks. */
export async function preserveMedia(planDir: string, stageDir: string, media: MediaPlan): Promise<MediaPlan> {
  const broken = mediaTimeline(media).placements.find((p) => p.attachmentBroken);
  if (broken) throw new KinottaError('invalid', `Placement ${broken.id} has a broken footage attachment. Repair it or choose Stay at time before Save.`);
  const folder = join(stageDir, MEDIA_DIR);
  await mkdir(folder, { recursive: true });
  const sources = [];
  for (const [index, source] of media.sources.entries()) {
    const partial = join(folder, `.incoming-${index}`);
    try {
      await copyFile(resolve(planDir, source.path), partial);
    } catch {
      throw new KinottaError('invalid', `Source ${source.id} could not be preserved. Relink the exact original or retry Save.`);
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(partial)) hash.update(chunk as Buffer);
    const contentHash = hash.digest('hex');
    if (source.contentHash && source.contentHash !== contentHash) throw new KinottaError('invalid', `Source ${source.id} changed. Relink the exact original or replace it with a new source.`);
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
