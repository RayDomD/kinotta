import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/** The brand's fonts in plain words, for Direction's Fonts row. */
export interface BrandFonts {
  words: string;
  numbers: string;
  /** Where they came from: the project's own brand, or Kinotta's built-in brand when the project has none. */
  source: 'brand' | 'built-in';
  /** The file the names were read from, relative to the project, when it is the project's own. */
  file?: string;
}

/** Kinotta's built-in brand (skill/kinotta/assets/brand/brand.md): Geist for words, Geist Mono for numbers. */
const BUILT_IN: BrandFonts = { words: 'Geist', numbers: 'Geist Mono', source: 'built-in' };
const NUMBER_ROLE = /numeral|number|mono|code|digit/i;

async function text(file: string): Promise<string | undefined> {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** The colour-and-type source `reels/brand.md` points at, kept inside the project. */
function typeSource(projectDir: string, brand: string | undefined): string {
  const named = brand && /colou?r and type:\s*`([^`]+)`/i.exec(brand)?.[1];
  const root = resolve(projectDir);
  const file = named ? resolve(root, named) : join(root, 'DESIGN.md');
  return file.startsWith(root + sep) ? file : join(root, 'DESIGN.md');
}

/**
 * Reads the families from a design file's `typography` front matter (as in Kinotta's own DESIGN.md): the first family
 * of a numeral, mono or code role for numbers, and of the first other role for words.
 */
export function fontsFromDesign(source: string): { words?: string; numbers?: string } {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
  const typography = /^typography:\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(front)?.[1] ?? '';
  const found: { words?: string; numbers?: string } = {};
  let role = '';
  for (const line of typography.split(/\r?\n/)) {
    const roleMatch = /^ {2}([\w-]+):\s*$/.exec(line);
    if (roleMatch) { role = roleMatch[1]!; continue; }
    const family = /fontFamily:\s*["']?([^,"'\n]+)/.exec(line)?.[1]?.trim();
    if (!family) continue;
    if (NUMBER_ROLE.test(role)) found.numbers ??= family;
    else found.words ??= family;
  }
  return found;
}

/** The project's brand fonts, through `reels/brand.md` or `DESIGN.md`, else the built-in brand's. */
export async function readBrandFonts(projectDir: string): Promise<BrandFonts> {
  const file = typeSource(projectDir, await text(join(projectDir, 'reels', 'brand.md')));
  const design = await text(file);
  const fonts = design ? fontsFromDesign(design) : {};
  if (!fonts.words) return BUILT_IN;
  const relativeFile = file.slice(resolve(projectDir).length + 1).split(sep).join('/');
  return { words: fonts.words, numbers: fonts.numbers ?? fonts.words, source: 'brand', file: relativeFile };
}
