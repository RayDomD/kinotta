import { mkdir, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KinottaError } from './errors.ts';
import { writeJsonAtomic } from './edit-list.ts';
import { makeOptions, type MakeOptions } from './make-options.ts';
import { serialized, stateFilePath } from './state.ts';
import { requireReelDir } from './version.ts';

export interface Style {
  id: string;
  name: string;
  scope: 'builtin' | 'user' | 'project';
  basedOn?: string;
  form?: string;
  look?: string;
  settings: Omit<MakeOptions, 'notes'>;
  yours: string[];
  fonts?: { words?: string; numbers?: string };
  music?: { file?: string; fit?: 'beat' | 'under'; duck?: boolean };
  effects: string[];
  shots?: string;
  rules: string[];
}
export interface StyleListing { styles: Style[]; defaultId: string }
const BUILTINS = fileURLToPath(new URL('../../../skill/kinotta/assets/styles/', import.meta.url));
const BUILTIN_IDS = ['clean', 'creator', 'editorial', 'flat-2d', 'layered-2d', 'filmed-3d'];
const SETTING_KEYS = ['videoType', 'broll', 'captions', 'pace'];
const homeDir = () => process.env.KINOTTA_HOME || join(homedir(), '.kinotta');
const invalid = (message: string): never => { throw new KinottaError('invalid', message); };
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Expected a style object.');
  return input as Record<string, unknown>;
}
function text(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) return invalid('Expected non-empty text.');
  return input;
}
function styleId(input: unknown): string {
  const id = text(input);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id === 'migrations') return invalid('Invalid style id.');
  return id;
}
function strings(input: unknown): string[] {
  if (!Array.isArray(input)) return invalid('Expected a list of text.');
  return input.map(text);
}

/** Runtime boundary shared by file reads and API writes. */
export function validateStyle(input: unknown): Style {
  const raw = object(input);
  if (!['builtin', 'user', 'project'].includes(raw.scope as string)) return invalid('Invalid style scope.');
  const settings = object(raw.settings);
  if (Object.keys(settings).some((key) => !SETTING_KEYS.includes(key))) return invalid('Invalid style setting.');
  const result: Style = {
    id: styleId(raw.id), name: text(raw.name), scope: raw.scope as Style['scope'],
    settings: makeOptions(settings), yours: strings(raw.yours), effects: strings(raw.effects), rules: strings(raw.rules),
  };
  if (result.yours.some((key) => !SETTING_KEYS.includes(key))) return invalid('Invalid changed setting.');
  if (raw.basedOn !== undefined) result.basedOn = styleId(raw.basedOn);
  for (const key of ['form', 'look', 'shots'] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'string') return invalid(`Invalid ${key}.`);
      result[key] = raw[key];
    }
  }
  if (raw.fonts !== undefined) {
    const fonts = object(raw.fonts);
    result.fonts = {};
    for (const key of ['words', 'numbers'] as const) if (fonts[key] !== undefined) result.fonts[key] = text(fonts[key]);
  }
  if (raw.music !== undefined) {
    const music = object(raw.music);
    result.music = {};
    if (music.file !== undefined) result.music.file = text(music.file);
    if (music.fit !== undefined) {
      if (music.fit !== 'beat' && music.fit !== 'under') return invalid('Invalid music fit.');
      result.music.fit = music.fit;
    }
    if (music.duck !== undefined) {
      if (typeof music.duck !== 'boolean') return invalid('Invalid music ducking.');
      result.music.duck = music.duck;
    }
  }
  return result;
}

async function readJson(file: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (error instanceof SyntaxError) return invalid(`Unreadable style data: ${file}`);
    throw error;
  }
}
async function write(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await serialized(file, () => writeJsonAtomic(file, value));
}
function stylesDir(projectDir: string, scope: Style['scope']): string {
  return scope === 'builtin' ? BUILTINS : scope === 'user' ? join(homeDir(), 'styles') : join(projectDir, 'reels', 'styles');
}
async function storedStyle(projectDir: string, id: string, scope: Style['scope']): Promise<Style | undefined> {
  const raw = await readJson(join(stylesDir(projectDir, scope), `${styleId(id)}.json`));
  if (raw === undefined) return undefined;
  const style = validateStyle(raw);
  if (style.id !== id || style.scope !== scope) return invalid('Style identity does not match its file.');
  return style;
}
async function findStyle(projectDir: string, id: string, scope?: Style['scope']): Promise<Style> {
  for (const candidate of scope ? [scope] : ['project', 'user', 'builtin'] as const) {
    const style = await storedStyle(projectDir, id, candidate);
    if (style) return style;
  }
  throw new KinottaError('not-found', `Style "${id}" not found.`);
}
export async function readStyle(projectDir: string, id: string, scope?: Style['scope']): Promise<Style> {
  await migrateStyles(projectDir);
  return findStyle(projectDir, id, scope);
}
export async function saveStyle(projectDir: string, scope: unknown, input: unknown): Promise<Style> {
  if (scope !== 'user' && scope !== 'project') return invalid('Built-in styles are read-only.');
  const style = validateStyle(input);
  if (style.scope !== scope || BUILTIN_IDS.includes(style.id)) return invalid('Save a copy under your own style id and scope.');
  await write(join(stylesDir(projectDir, scope), `${style.id}.json`), style);
  return style;
}
async function defaultId(): Promise<string | undefined> {
  const marker = await readJson(join(homeDir(), 'style-default.json'));
  return marker === undefined ? undefined : styleId(object(marker).id);
}
export async function resolveDefaultStyle(projectDir: string, videoType?: string): Promise<Style> {
  await migrateStyles(projectDir);
  const id = await defaultId();
  if (id) {
    try { return await findStyle(projectDir, id); }
    catch (error) { if (!(error instanceof KinottaError) || error.code !== 'not-found') throw error; }
  }
  // A look id can select a code-built preset; footage without a saved choice uses Clean.
  return findStyle(projectDir, BUILTIN_IDS.includes(videoType ?? '') ? videoType! : 'clean', 'builtin');
}
export async function saveDefaultStyle(projectDir: string, input: unknown): Promise<Style> {
  const style = await readStyle(projectDir, styleId(object(input).id));
  await write(join(homeDir(), 'style-default.json'), { id: style.id });
  return style;
}
export async function listStyles(projectDir: string, videoType?: string): Promise<StyleListing> {
  await migrateStyles(projectDir);
  const styles: Style[] = [];
  for (const scope of ['builtin', 'user', 'project'] as const) {
    let files: string[];
    try { files = await readdir(stylesDir(projectDir, scope)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of files.sort()) {
      if (!file.endsWith('.json') || file === 'migrations.json') continue;
      styles.push(await findStyle(projectDir, file.slice(0, -5), scope));
    }
  }
  return { styles, defaultId: (await resolveDefaultStyle(projectDir, videoType)).id };
}
function reelStyleFile(projectDir: string, slug: string): string {
  return join(dirname(stateFilePath(projectDir, slug, 1)), 'style.json');
}
export async function readReelStyle(projectDir: string, slug: string): Promise<Style | null> {
  await requireReelDir(projectDir, slug);
  const raw = await readJson(reelStyleFile(projectDir, slug));
  return raw === undefined ? null : validateStyle(raw);
}
export async function copyStyleToReel(projectDir: string, slug: string, input: unknown): Promise<Style> {
  await requireReelDir(projectDir, slug);
  const source = await readStyle(projectDir, styleId(object(input).id));
  const copy = validateStyle({ ...source, scope: 'project', basedOn: source.id });
  await write(reelStyleFile(projectDir, slug), copy);
  return copy;
}

interface Migrations { taste?: string; profile?: string }
async function migrationRecord(file: string): Promise<Migrations> {
  return object(await readJson(file) ?? {}) as Migrations;
}
async function personalStyle(projectDir: string, id = 'my-style'): Promise<Style> {
  return await storedStyle(projectDir, id, 'user') ?? { id, name: 'My style', scope: 'user', settings: {}, yours: [], effects: [], rules: [] };
}
async function makeDefaultIfMissing(id: string): Promise<void> {
  const file = join(homeDir(), 'style-default.json');
  await serialized(`${file}.default`, async () => {
    if (await defaultId() === undefined) await write(file, { id });
  });
}
async function migrateTaste(projectDir: string, scope: 'user' | 'project'): Promise<void> {
  const root = scope === 'user' ? homeDir() : join(projectDir, 'reels');
  const marker = join(scope === 'user' ? root : join(root, 'styles'), 'migrations.json');
  await serialized(`${marker}.migration`, async () => {
    const record = await migrationRecord(marker);
    if (record.taste) return;
    let source: string;
    try { source = await readFile(join(root, 'taste.md'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const rules = source.split(/\r?\n/).flatMap((line) => {
      const match = /^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/.exec(line);
      return match ? [match[1]!] : [];
    });
    const id = scope === 'user' ? record.profile ?? 'my-style' : 'project-style';
    const existing = await storedStyle(projectDir, id, scope);
    const style: Style = existing ?? { id, name: scope === 'user' ? 'My style' : 'Project style', scope, settings: {}, yours: [], effects: [], rules: [] };
    style.rules = [...new Set([...style.rules, ...rules])];
    await saveStyle(projectDir, scope, style);
    if (scope === 'user') await makeDefaultIfMissing(id);
    await write(marker, { ...record, taste: id });
  });
}
export async function migrateStyles(projectDir: string): Promise<void> {
  await migrateTaste(projectDir, 'user');
  await migrateTaste(projectDir, 'project');
}
export async function migrateStyleProfile(projectDir: string, input: unknown): Promise<Style> {
  const raw = object(typeof input === 'string' ? (() => {
    try { return JSON.parse(input); } catch { return invalid('Invalid browser profile.'); }
  })() : input);
  const settings = makeOptions({ ...raw, videoType: raw.videoType === 'decide' ? undefined : raw.videoType, captions: raw.captions === 'word by word' ? 'word-by-word' : raw.captions });
  const { notes: _notes, ...profileSettings } = settings;
  await migrateStyles(projectDir);
  const marker = join(homeDir(), 'migrations.json');
  return serialized(`${marker}.migration`, async () => {
    const record = await migrationRecord(marker);
    if (record.profile) return findStyle(projectDir, record.profile, 'user');
    const style = await personalStyle(projectDir, record.taste);
    style.settings = { ...style.settings, ...profileSettings };
    const overridden = raw.overridden === undefined ? {} : object(raw.overridden);
    style.yours = [...new Set([...style.yours, ...SETTING_KEYS.filter((key) => overridden[key] === true && key in profileSettings)])];
    await saveStyle(projectDir, 'user', style);
    await makeDefaultIfMissing(style.id);
    await write(marker, { ...record, profile: style.id });
    return style;
  });
}
