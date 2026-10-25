import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { KinottaError } from './errors.ts';
import { serialized } from './state.ts';

const FONTS_DIR = 'fonts';
const LICENSES_FILE = 'LICENSES.md';
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
/** Larger than any single font family file in practice; a drop past it is not a font. */
const MAX_FONT_BYTES = 30 * 1024 * 1024;

export interface ImportedFont {
  /** Project-relative, with `/` separators: `fonts/Brand-Bold.woff2`. */
  path: string;
  /** A family name from the file name, for the style and the agent. */
  family: string;
}

/** `Brand_Sans-Bold.woff2` reads as "Brand Sans Bold". */
export const familyFromFile = (name: string): string =>
  basename(name, extname(name)).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim() || 'Your font';

/**
 * Copies a font dropped on Direction into the project's `fonts/`, so renders can use it, and records it in
 * `fonts/LICENSES.md` with a note that the owner is responsible for its license. A name already taken gets a number.
 */
export async function importFont(projectDir: string, name: string, body: AsyncIterable<Uint8Array>): Promise<ImportedFont> {
  const wanted = (name.split(/[\\/]/).pop() ?? '').replace(/[<>:"|?*`\u0000-\u001f]/g, '_').trim().replace(/^\.+/, '');
  const extension = extname(wanted).toLowerCase();
  if (!FONT_EXTENSIONS.has(extension)) throw new KinottaError('invalid', 'Drop a .ttf, .otf, .woff or .woff2 font.');
  const folder = join(projectDir, FONTS_DIR);
  await mkdir(folder, { recursive: true });
  const partial = join(folder, `.incoming-${randomUUID()}`);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > MAX_FONT_BYTES) throw new KinottaError('invalid', 'That file is too large to be a font.');
      chunks.push(chunk);
    }
    if (size === 0) throw new KinottaError('invalid', 'The font file is empty.');
    await writeFile(partial, Buffer.concat(chunks));
    const stem = basename(wanted, extname(wanted));
    // One drop at a time picks a name, so two fonts of the same name never overwrite each other.
    const selected = await serialized(folder, async () => {
      let free = `${stem}${extension}`;
      for (let index = 2; await stat(join(folder, free)).then(() => true, () => false); index += 1) free = `${stem}-${index}${extension}`;
      await rename(partial, join(folder, free));
      const day = new Date().toISOString().slice(0, 10);
      await appendFile(join(folder, LICENSES_FILE), `- \`${free}\`: added from Direction on ${day}. License not recorded; use a font you are licensed to use.\n`, 'utf8');
      return free;
    });
    return { path: `${FONTS_DIR}/${selected}`, family: familyFromFile(wanted) };
  } finally {
    await rm(partial, { force: true });
  }
}
