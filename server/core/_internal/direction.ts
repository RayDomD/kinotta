import type { MakeOptions } from './make-options.ts';
import type { Style } from './style.ts';
/**
 * What Direction offers and what the agent is told about a reel's style. No file or process access: the web app
 * renders "What the agent is told" with `agentTold`, and the server puts the same lines in the agent's request, so
 * the screen and the agent cannot disagree.
 */

export type Frame = 'portrait' | 'landscape' | 'square';
export const FRAMES: readonly { id: Frame; label: string }[] = [
  { id: 'portrait', label: 'Portrait 9:16' },
  { id: 'landscape', label: 'Landscape 16:9' },
  { id: 'square', label: 'Square 1:1' },
];
const SQUARE_TOLERANCE = 0.1;

/** The frame a picture fits, or undefined when its size is unknown. */
export function frameOf(width?: number, height?: number): Frame | undefined {
  if (!width || !height) return undefined;
  const ratio = width / height;
  return Math.abs(ratio - 1) <= SQUARE_TOLERANCE ? 'square' : ratio < 1 ? 'portrait' : 'landscape';
}

export interface FormDefinition {
  id: string;
  label: string;
  description: string;
  /** Built from your video, or code-built from a brief with no footage. */
  footage: boolean | 'either';
  /** The Make option the footage build reads. */
  videoType?: NonNullable<MakeOptions['videoType']>;
  /** The built-in style picked for this form until you choose another. */
  look: string;
  told: string;
}
export const FORMS: readonly FormDefinition[] = [
  { id: 'talking-video', label: 'Talking video', description: 'You on camera; graphics and b-roll over it', footage: true, videoType: 'explainer', look: 'creator', told: 'Keep the speaker primary; cover jump cuts.' },
  { id: 'interview', label: 'Interview', description: 'Two or more people; cut between them', footage: true, videoType: 'interview', look: 'clean', told: 'Cut between speakers; split layouts.' },
  { id: 'tutorial', label: 'Tutorial', description: 'The screen stays main; zooms and callouts', footage: true, videoType: 'tutorial', look: 'clean', told: 'The screen stays main; 5 to 8 word callouts.' },
  { id: 'demo', label: 'Product demo', description: 'Product first, the pitch in 3 seconds', footage: true, videoType: 'demo', look: 'editorial', told: 'Show the proposition in the first 3 seconds.' },
  { id: 'vlog', label: 'Vlog', description: 'Sparse graphics; real over polished', footage: true, videoType: 'vlog', look: 'clean', told: 'Sparse graphics; keep it real over polished.' },
  { id: 'launch', label: 'Launch', description: 'A short reel built from graphics', footage: false, look: 'layered-2d', told: 'Code-built shots; one idea per shot.' },
  { id: 'explainer', label: 'Explainer', description: 'Steps from a start to a result', footage: false, look: 'flat-2d', told: 'Steps with a clear start and result.' },
  { id: 'showreel', label: 'Showreel', description: 'Techniques cut to a beat', footage: false, look: 'filmed-3d', told: 'Cut to tempo; one signature move.' },
  { id: 'decide', label: 'Let Kinotta decide', description: 'Guessed from the brief or the video', footage: 'either', look: 'clean', told: '' },
];
export const formById = (id?: string): FormDefinition | undefined => FORMS.find((form) => form.id === id);

export interface LookDefinition { id: string; label: string; description: string; footage: boolean; told: string }
/** The built-in styles: Style for video forms, Look for code-built ones. */
export const LOOKS: readonly LookDefinition[] = [
  { id: 'clean', label: 'Clean', description: 'Small tags and quiet captions. You stay the picture.', footage: true, told: 'The speaker stays the picture; tags small and brief.' },
  { id: 'creator', label: 'Creator', description: 'Bold word captions, punch-ins, pop-ups on the beat.', footage: true, told: 'Word captions with one accent word; punch-ins and pop-ups on stressed words.' },
  { id: 'editorial', label: 'Editorial', description: 'You framed in a card, panels beside you, a film look.', footage: true, told: 'Framed speaker, panels beside, film look on cutaways.' },
  { id: 'flat-2d', label: 'Flat 2D', description: 'Everything on one plane; no camera moves.', footage: false, told: 'Keep everything on one plane; no camera moves.' },
  { id: 'layered-2d', label: 'Layered 2D', description: 'Cards and panels at two or three depths.', footage: false, told: 'Cards and panels at two or three depths with gentle parallax.' },
  { id: 'filmed-3d', label: 'Filmed 3D', description: 'A 3D world with a moving camera.', footage: false, told: 'Read reference/motion-craft.md; write a treatment first. WebGL allowed for light-led shots.' },
];
export const lookById = (id?: string): LookDefinition | undefined => LOOKS.find((look) => look.id === id);

/** The look a style was built on: its own `look`, or the built-in it was copied from. */
export const styleLook = (style: Pick<Style, 'look' | 'basedOn' | 'id'>): string | undefined =>
  style.look ?? (lookById(style.basedOn) ? style.basedOn : lookById(style.id) ? style.id : undefined);

/** A style's music: absent means Kinotta picks, an empty record means no music, a file means your own track. */
export type MusicChoice = 'kinotta' | 'none' | 'file';
export function musicChoice(style: Pick<Style, 'music'>): MusicChoice {
  if (!style.music) return 'kinotta';
  return style.music.file ? 'file' : Object.keys(style.music).length === 0 ? 'none' : 'kinotta';
}

/** The footage build's options from a style: its settings, with the form's video type when the style names none. */
export function styleMakeOptions(style: Pick<Style, 'settings' | 'form'>): Omit<MakeOptions, 'notes'> {
  const videoType = style.settings.videoType ?? formById(style.form)?.videoType;
  return { ...style.settings, ...(videoType ? { videoType } : {}) };
}

export interface ToldContext {
  /** "What's it about?": the owner's words. */
  about?: string;
  frame?: Frame;
  /** True when the frame was read from the video rather than chosen. */
  frameFound?: boolean;
}
const SETTING_NAMES: Record<string, string> = { videoType: 'Video type', broll: 'B-roll', captions: 'Captions', pace: 'Pace' };
const quoted = (text: string): string => JSON.stringify(text.trim());

/**
 * What the agent is told about this reel's style, one line per decision. Words the owner typed are quoted as JSON so
 * they read as a brief, not as instructions to the agent.
 */
export function agentTold(style: Style, context: ToldContext = {}): string[] {
  const lines: string[] = [];
  const form = formById(style.form);
  lines.push(form && form.id !== 'decide' ? `Form: ${form.id}. ${form.told}` : 'Form: decide from the video, then say which form you chose.');
  const lookId = styleLook(style);
  const look = lookById(lookId);
  lines.push(look ? `Style: ${look.id}. ${look.told}` : `Style: ${style.name}.`);
  const frame = FRAMES.find((frame) => frame.id === context.frame);
  if (frame) lines.push(`Frame: ${frame.label}${context.frameFound ? ', found in the video' : ''}.`);
  const settings = Object.entries(style.settings).filter(([key]) => key !== 'videoType');
  if (settings.length) lines.push(`Settings: ${settings.map(([key, value]) => `${SETTING_NAMES[key] ?? key} ${value}${style.yours.includes(key) ? ' (the owner\'s choice)' : ''}`).join('; ')}.`);
  const fonts = style.fonts;
  lines.push(fonts?.words || fonts?.numbers
    ? `Fonts: ${[fonts.words && `${fonts.words} for words`, fonts.numbers && `${fonts.numbers} for numbers`].filter(Boolean).join(', ')}.`
    : 'Fonts: the brand fonts.');
  const music = musicChoice(style);
  if (music === 'none') lines.push(form?.footage === false ? 'Music: none.' : 'Music: none; only the sound in the video.');
  else if (music === 'kinotta') lines.push('Music: make a score that fits the cut.');
  else {
    const fit = style.music?.fit === 'under' ? 'play it under the cut' : 'cut on its beat';
    lines.push(`Music: ${style.music!.file}; ${fit}${style.music?.duck === false ? '; leave it at full level under the voice' : '; lower it under the voice'}.`);
  }
  if (style.effects.length) lines.push(`Effects to try: ${style.effects.join(', ')}. Place them on the right words.`);
  if (style.shots?.trim()) lines.push(`Shots and details wanted: ${quoted(style.shots)}.`);
  if (context.about?.trim()) lines.push(`What it is about: ${quoted(context.about)}.`);
  for (const rule of style.rules) lines.push(`Rule: ${quoted(rule)}.`);
  lines.push(lookId === 'filmed-3d' ? 'Checks: camera and depth checks on top of the mechanical ones.' : 'Checks: mechanical only.');
  return lines;
}
