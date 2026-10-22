import type { BrollAmount, VisualPace } from '../model.ts';
import { KinottaError } from './errors.ts';

export const VIDEO_TYPES = ['explainer', 'interview', 'tutorial', 'demo', 'short', 'lecture', 'vlog'] as const;
export const CAPTION_MODES = ['off', 'phrases', 'word-by-word'] as const;
export const MAX_MAKE_NOTES = 4000;
export interface MakeOptions {
  videoType?: typeof VIDEO_TYPES[number];
  broll?: BrollAmount;
  captions?: typeof CAPTION_MODES[number];
  pace?: VisualPace;
  notes?: string;
}

/** Runtime boundary: called before probing, copying media or creating a reel. */
export function makeOptions(input: unknown): MakeOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new KinottaError('invalid', 'Expected Make options.');
  const body = input as Record<string, unknown>;
  const options: Record<string, unknown> = {};
  for (const [key, values] of Object.entries({ videoType: VIDEO_TYPES, broll: ['light', 'medium', 'heavy'], captions: CAPTION_MODES, pace: ['calm', 'normal', 'fast'] })) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) throw new KinottaError('invalid', `Invalid ${key}.`);
    options[key] = value;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > MAX_MAKE_NOTES) throw new KinottaError('invalid', `Notes must be text of at most ${MAX_MAKE_NOTES} characters.`);
    if (body.notes.trim()) options.notes = body.notes.trim();
  }
  return options as MakeOptions;
}

export function engineCaptions(mode: MakeOptions['captions']): true | false | { look: 'phrase' | 'words' } {
  return mode === undefined ? true : mode === 'off' ? false : { look: mode === 'phrases' ? 'phrase' : 'words' };
}

