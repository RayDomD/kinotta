import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { KinottaError } from './errors.ts';
import { writeJsonAtomic } from './edit-list.ts';
import { listStyles, saveStyle, validateStyle, type Style } from './style.ts';

/**
 * A project style an agent suggests from the owner's reference videos (docs/plans/2026-10-31-style-from-examples.md).
 * It is not a style until the owner keeps it on the Direction screen: it waits in reels/styles/.suggested/, which the
 * style listing does not read. Keep saves it, as edited there, as an ordinary project style; Discard removes it.
 */
export interface SuggestedStyle {
  style: Style;
  /** The reference videos it came from, as the agent named them (file names, not copies). */
  references: string[];
  /** What was measured, as measure_style.py reported it, for the card to show beside the rules. */
  measured?: Record<string, unknown>;
  /** The agent that suggested it, lowercase, one word. */
  suggestedBy: string;
  /** ISO 8601. */
  createdAt: string;
}

const MAX_REFERENCES = 5;
const invalid = (message: string): never => { throw new KinottaError('invalid', message); };
const suggestedDir = (projectDir: string): string => join(projectDir, 'reels', 'styles', '.suggested');
const fileOf = (projectDir: string, id: string): string => join(suggestedDir(projectDir), `${id}.json`);

function checkSuggestion(input: unknown): Omit<SuggestedStyle, 'createdAt'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Expected a suggested style object.');
  const raw = input as Record<string, unknown>;
  const style = validateStyle(raw.style);
  if (style.scope !== 'project') return invalid('A suggested style is a project style: give it "scope": "project".');
  if (style.rules.length === 0) return invalid('A suggested style needs at least one rule, each saying which reference it came from.');
  const references = raw.references;
  if (!Array.isArray(references) || references.length === 0 || references.length > MAX_REFERENCES || !references.every((r) => typeof r === 'string' && r.trim())) {
    return invalid(`Name the reference videos it came from: one to ${MAX_REFERENCES}.`);
  }
  if (raw.measured !== undefined && (typeof raw.measured !== 'object' || raw.measured === null || Array.isArray(raw.measured))) return invalid('"measured" must be the measure_style.py report.');
  const by = typeof raw.suggestedBy === 'string' ? raw.suggestedBy.trim().toLowerCase() : '';
  if (!/^[a-z][a-z0-9-]*$/.test(by)) return invalid('Say which agent suggested it: "suggestedBy", one lowercase word.');
  return { style, references: references.map((r) => (r as string).trim()), ...(raw.measured ? { measured: raw.measured as Record<string, unknown> } : {}), suggestedBy: by };
}

async function taken(projectDir: string, id: string): Promise<boolean> {
  return (await listStyles(projectDir)).styles.some((s) => s.id === id);
}

/** Records an agent's suggestion. Refuses one whose id is already a style, so keeping it can never overwrite. */
export async function suggestStyle(projectDir: string, input: unknown, now: () => Date = () => new Date()): Promise<SuggestedStyle> {
  const checked = checkSuggestion(input);
  if (await taken(projectDir, checked.style.id)) return invalid(`A style named "${checked.style.id}" already exists. Suggest it under a new id.`);
  const suggestion: SuggestedStyle = { ...checked, createdAt: now().toISOString() };
  await mkdir(suggestedDir(projectDir), { recursive: true });
  await writeJsonAtomic(fileOf(projectDir, checked.style.id), suggestion);
  return suggestion;
}

export async function listSuggestedStyles(projectDir: string): Promise<SuggestedStyle[]> {
  const files = await readdir(suggestedDir(projectDir)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  const found: SuggestedStyle[] = [];
  for (const file of files.filter((f) => f.endsWith('.json')).sort()) {
    const raw = JSON.parse(await readFile(join(suggestedDir(projectDir), file), 'utf8')) as SuggestedStyle;
    found.push({ ...checkSuggestion(raw), createdAt: String(raw.createdAt) });
  }
  return found;
}

async function readSuggestion(projectDir: string, id: string): Promise<SuggestedStyle> {
  const suggestion = (await listSuggestedStyles(projectDir)).find((s) => s.style.id === id);
  if (!suggestion) throw new KinottaError('not-found', `There is no suggested style "${id}".`);
  return suggestion;
}

/** Saves the suggestion, as the owner edited it, as a project style and removes the suggestion. */
export async function keepSuggestedStyle(projectDir: string, id: string, edited?: unknown): Promise<Style> {
  const suggestion = await readSuggestion(projectDir, id);
  const style = edited === undefined ? suggestion.style : validateStyle(edited);
  if (style.id !== id || style.scope !== 'project') return invalid('Keep the suggested style under its own id, as a project style.');
  if (await taken(projectDir, id)) return invalid(`A style named "${id}" already exists.`);
  const saved = await saveStyle(projectDir, 'project', style);
  await rm(fileOf(projectDir, id), { force: true });
  return saved;
}

export async function discardSuggestedStyle(projectDir: string, id: string): Promise<void> {
  await readSuggestion(projectDir, id);
  await rm(fileOf(projectDir, id), { force: true });
}
