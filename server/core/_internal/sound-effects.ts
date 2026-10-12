import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { KinottaError } from './errors.ts';
import { importMedia } from './media-library.ts';
import type { SoundEffect } from './types.ts';

const EFFECTS_DIR = resolve(import.meta.dirname, '../../../skill/kinotta/assets/sfx');

export async function soundEffects(): Promise<SoundEffect[]> {
  const manifest = JSON.parse(await readFile(join(EFFECTS_DIR, 'manifest.json'), 'utf8')) as Record<string, { file: string; duration: number; description: string }>;
  return Object.entries(manifest).map(([id, effect]) => ({ id, name: id.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '), ...effect }));
}

/** Only catalogue identities can resolve bundled files. Preview does not modify the project. */
export async function soundEffectFile(id: string): Promise<string> {
  const effect = (await soundEffects()).find((effect) => effect.id === id);
  if (!effect) throw new KinottaError('not-found', 'This sound effect is not in the bundled catalogue.');
  return join(EFFECTS_DIR, effect.file);
}

export async function importSoundEffect(projectDir: string, id: string) {
  const file = await soundEffectFile(id);
  return importMedia(projectDir, `${id}.mp3`, createReadStream(file));
}
