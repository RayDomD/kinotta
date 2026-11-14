import { resolve } from 'node:path';
import { hashOf } from './import.ts';
import { legacySourcesOf } from './media-model.ts';
import type { MediaPlan } from './media-model.ts';

/** A plan's media and the folder its source paths are relative to. */
export interface PlacedMedia {
  media: MediaPlan | null | undefined;
  planDir: string;
}

/** The file's content hash, or null when it cannot be read. `hashOf` caches it per file identity (path, size, mtime). */
const hashOrNull = (projectDir: string, file: string): Promise<string | null> => hashOf(file, projectDir).catch(() => null);

/**
 * The legacy source of `after` that holds the same bytes as `file`, or undefined when none does. An agent's version may
 * copy footage into its own folder, so the same footage reaches a new version under a new path and so a new id.
 */
export async function sameLegacyFootage(projectDir: string, file: string, after: PlacedMedia): Promise<string | undefined> {
  const candidates = legacySourcesOf(after.media);
  if (candidates.length === 0) return undefined;
  const hash = await hashOrNull(projectDir, file);
  if (hash === null) return undefined;
  for (const source of candidates) {
    if ((source.contentHash ?? await hashOrNull(projectDir, resolve(after.planDir, source.path))) === hash) return source.id;
  }
  return undefined;
}

/**
 * Old legacy source id to new, for each legacy source of `before` that `after` no longer has but holds the same bytes of
 * under another path. A source `after` still names, or whose bytes it does not hold, is left out.
 */
export async function legacyFootageRenames(projectDir: string, before: PlacedMedia, after: PlacedMedia): Promise<Map<string, string>> {
  const renames = new Map<string, string>();
  const kept = new Set((after.media?.sources ?? []).map((s) => s.id));
  for (const source of legacySourcesOf(before.media)) {
    if (kept.has(source.id)) continue;
    const match = await sameLegacyFootage(projectDir, resolve(before.planDir, source.path), after);
    if (match !== undefined) renames.set(source.id, match);
  }
  return renames;
}
