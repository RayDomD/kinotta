import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { KinottaError } from './errors.ts';

const EFFECTS_DIR = resolve(import.meta.dirname, '../../../skill/kinotta/templates/effects');

export type EffectCategory = 'words' | 'lists' | 'speaker' | 'screens' | 'looks' | 'structure';

const VALID_CATEGORIES = new Set<EffectCategory>([
  'words',
  'lists',
  'speaker',
  'screens',
  'looks',
  'structure',
]);

const ALLOWED_PREVIEW_FILES = new Set([
  'shot.html',
  'shot.css',
  'shot.js',
  'shared.css',
  'presets.css',
]);

export interface EffectCatalogueEntry {
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  needs: string;
  forms: string[];
  instant: boolean;
  instantFrom?: string;
  ask?: string;
}

/** Reads the bundled effect catalogue from skill/kinotta/templates/effects/catalogue.json and validates each entry. */
export async function effectsCatalogue(): Promise<EffectCatalogueEntry[]> {
  const file = join(EFFECTS_DIR, 'catalogue.json');
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new KinottaError('not-found', 'Effects catalogue not found.');
  }

  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new KinottaError('invalid', 'Effects catalogue JSON is malformed.');
  }

  if (!Array.isArray(entries)) {
    throw new KinottaError('invalid', 'Effects catalogue must be an array.');
  }

  const seenIds = new Set<string>();

  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      throw new KinottaError('invalid', 'Effects catalogue entry must be an object.');
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) {
      throw new KinottaError('invalid', `Invalid effect id: ${String(e.id)}`);
    }
    if (seenIds.has(e.id)) {
      throw new KinottaError('invalid', `Duplicate effect id in catalogue: ${e.id}`);
    }
    seenIds.add(e.id);

    if (typeof e.name !== 'string' || !e.name.trim()) {
      throw new KinottaError('invalid', `Effect ${e.id} missing name.`);
    }
    if (typeof e.category !== 'string' || !VALID_CATEGORIES.has(e.category as EffectCategory)) {
      throw new KinottaError('invalid', `Effect ${e.id} has invalid category: ${String(e.category)}`);
    }
    if (typeof e.description !== 'string' || !e.description.trim()) {
      throw new KinottaError('invalid', `Effect ${e.id} missing description.`);
    }
    if (typeof e.needs !== 'string' || !e.needs.trim()) {
      throw new KinottaError('invalid', `Effect ${e.id} missing needs.`);
    }
    if (!Array.isArray(e.forms) || e.forms.length === 0 || !e.forms.every((f) => typeof f === 'string' && f.trim())) {
      throw new KinottaError('invalid', `Effect ${e.id} forms must be a non-empty array of strings.`);
    }
    if (typeof e.instant !== 'boolean') {
      throw new KinottaError('invalid', `Effect ${e.id} instant flag must be boolean.`);
    }
    if (e.instant && (typeof e.instantFrom !== 'string' || !e.instantFrom.trim())) {
      throw new KinottaError('invalid', `Effect ${e.id} is marked instant but missing instantFrom.`);
    }

    try {
      const folderStat = await stat(join(EFFECTS_DIR, e.id, 'r1'));
      if (!folderStat.isDirectory()) {
        throw new KinottaError('invalid', `Template folder for effect ${e.id} is not a directory.`);
      }
    } catch {
      throw new KinottaError('invalid', `Template folder missing for effect ${e.id}.`);
    }
  }

  return entries as EffectCatalogueEntry[];
}

/** Resolves an allowed preview file for an effect template. Only catalogue identities and whitelist files can be served. */
export async function effectPreviewFile(id: string, file: string): Promise<string> {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new KinottaError('not-found', 'Unknown effect template.');
  }

  if (!ALLOWED_PREVIEW_FILES.has(file) || file.includes('..') || file.includes('/') || file.includes('\\')) {
    throw new KinottaError('not-found', 'Preview file not found.');
  }

  const catalogue = await effectsCatalogue();
  const entry = catalogue.find((e) => e.id === id);
  if (!entry) {
    throw new KinottaError('not-found', 'Unknown effect template.');
  }

  if (file === 'shared.css' || file === 'presets.css') {
    return join(EFFECTS_DIR, file);
  }

  const filePath = join(EFFECTS_DIR, id, 'r1', file);
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error();
    return filePath;
  } catch {
    throw new KinottaError('not-found', `File ${file} not found for effect ${id}.`);
  }
}
