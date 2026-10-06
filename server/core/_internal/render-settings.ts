import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic, withReelLock } from './edit-list.ts';
import { KinottaError } from './errors.ts';
import type { RenderPreset, RenderRequest, RenderSettings } from './types.ts';
import { requireReelDir } from './version.ts';

/** A reel's remembered settings, one set per preset (R16). Only a remembered render (Picker's) writes it. */
export const RENDER_SETTINGS_FILE = 'render-settings.json';

const FPS_VALUES: ReadonlyArray<RenderSettings['fps']> = ['source', 24, 25, 30, 60];
const SIZE_VALUES: ReadonlyArray<RenderSettings['size']> = ['half', 'source', '1080p', '4k'];
const QUALITY_VALUES: ReadonlyArray<RenderSettings['quality']> = ['standard', 'high'];
const AUDIO_VALUES: ReadonlyArray<RenderSettings['audio']> = ['smooth', 'hard'];

/** R2's defaults as settings: Draft is half size, Final and Overlay the source's size; all at the source's rate. */
export const PRESET_SETTINGS: Record<RenderPreset, RenderSettings> = {
  draft: { fps: 'source', size: 'half', quality: 'standard', audio: 'smooth' },
  final: { fps: 'source', size: 'source', quality: 'standard', audio: 'smooth' },
  overlay: { fps: 'source', size: 'source', quality: 'standard', audio: 'smooth' },
};

export type PresetSettings = Record<RenderPreset, RenderSettings>;

/** The known settings in a value, dropping anything a build doesn't know (a hand edit, a setting since removed). */
function knownSettings(value: unknown): Partial<RenderSettings> {
  if (value === null || typeof value !== 'object') return {};
  const { fps, size, quality, audio } = value as Record<string, unknown>;
  const known: Partial<RenderSettings> = {};
  if (FPS_VALUES.includes(fps as RenderSettings['fps'])) known.fps = fps as RenderSettings['fps'];
  if (SIZE_VALUES.includes(size as RenderSettings['size'])) known.size = size as RenderSettings['size'];
  if (QUALITY_VALUES.includes(quality as RenderSettings['quality'])) known.quality = quality as RenderSettings['quality'];
  if (AUDIO_VALUES.includes(audio as RenderSettings['audio'])) known.audio = audio as RenderSettings['audio'];
  return known;
}

async function readSaved(reelDir: string): Promise<Partial<Record<RenderPreset, unknown>>> {
  try {
    return JSON.parse(await readFile(join(reelDir, RENDER_SETTINGS_FILE), 'utf8')) as Partial<Record<RenderPreset, unknown>>;
  } catch {
    return {};
  }
}

/** Each preset's settings for a reel: its saved ones over the preset's defaults. Throws `not-found` for an unknown reel. */
export async function readRenderSettings(projectDir: string, slug: string): Promise<PresetSettings> {
  const saved = await readSaved(await requireReelDir(projectDir, slug));
  const entry = (preset: RenderPreset): RenderSettings => ({ ...PRESET_SETTINGS[preset], ...knownSettings(saved[preset]) });
  return { draft: entry('draft'), final: entry('final'), overlay: entry('overlay') };
}

/**
 * The settings a render uses: the request's own over the reel's saved ones for its preset. Throws `invalid` naming a
 * setting the request gives a value it doesn't know.
 */
export function requestSettings(saved: RenderSettings, request: RenderRequest): RenderSettings {
  const checks: Array<[keyof RenderSettings, readonly unknown[]]> = [['fps', FPS_VALUES], ['size', SIZE_VALUES], ['quality', QUALITY_VALUES], ['audio', AUDIO_VALUES]];
  for (const [name, values] of checks) {
    const value = request[name];
    if (value !== undefined && !values.includes(value)) {
      throw new KinottaError('invalid', `Unknown ${name} "${String(value)}". Use ${values.join(', ')}.`);
    }
  }
  const { fps, size, quality, audio } = request;
  return { ...saved, ...knownSettings({ fps, size, quality, audio }) };
}

/** Saves one preset's settings for a reel, keeping the other presets'. */
export async function saveRenderSettings(reelDir: string, preset: RenderPreset, settings: RenderSettings): Promise<void> {
  await withReelLock(reelDir, async () => {
    const saved = await readSaved(reelDir);
    await writeJsonAtomic(join(reelDir, RENDER_SETTINGS_FILE), { ...saved, [preset]: settings });
  });
}
