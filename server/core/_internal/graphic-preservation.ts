import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { KinottaError } from './errors.ts';

/** The version folder that frozen graphic dependencies are copied into. HTML fragments are inlined at the version root. */
const FOLDER = 'dependencies';
/** Files whose own references are read and rewritten; any other file is copied as it is. */
const CODE_FILES = ['.html', '.css', '.js', '.mjs'];

/** HTML attributes and CSS `url()` naming one file. */
const HTML_REFERENCE = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi;
/** `srcset`, naming several candidates, each a file and an optional descriptor. */
const HTML_SRCSET = /\bsrcset\s*=\s*(["'])([^"']+)\1/gi;
/** Inline scripts: their loads are resolved against the page, which is the version root. */
const INLINE_SCRIPT = /(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi;
/** Stands in for an inline script's body while the markup around it is rewritten. Never valid in authored HTML. */
const SCRIPT_MARK = '\u0000';
const CSS_REFERENCE = /url\(\s*["']?([^)'"\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi;
/** Module imports, which resolve against the script file itself. */
const SCRIPT_IMPORT = /\b(?:from\s*|import\s*\(\s*|import\s+)(["'`])([^"'`$]+)\1/g;
/** Loads that resolve against the page: fetch, a URL, an element's src. */
const SCRIPT_LOAD = /(?:\bfetch\s*\(\s*|\bnew\s+URL\s*\(\s*|\.src\s*=\s*)(["'`])([^"'`$]+)\1/g;
/** A load whose path is built while the page runs (a variable, a sum, a template), so no file can be frozen for it. */
const SCRIPT_BUILT = /(?:\bimport\s*\(|\bfetch\s*\(|\bnew\s+URL\s*\(|\.src\s*=(?!=)|\bsetAttribute\s*\(\s*["'](?:src|href|srcset)["']\s*,)\s*(?:["'][^"']*["']\s*\+|`[^`]*\$\{|(?!["'`])[\w$])/;

/** What a reference resolves against when the page runs: the file naming it, or the page. */
type Base = 'file' | 'page';
/** The text a reference becomes, or null to leave it as written. */
type Replace = (reference: string, base: Base) => Promise<string | null>;

const posix = (path: string): string => path.split(sep).join('/');
const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/** Refuses a reference that leaves the project: a scheme, `//` or an absolute path. Data URLs and fragments stay. */
function local(reference: string): boolean {
  if (/^(?:data:|#)/i.test(reference)) return false;
  if (/^(?:[a-z]+:|\/\/|\/)/i.test(reference)) throw new KinottaError('invalid', `Graphic dependency cannot be frozen: ${reference}`);
  return true;
}

/** Rewrites each match of `pattern`, its reference read by `group`, through `replace`. */
async function each(text: string, pattern: RegExp, group: (match: RegExpMatchArray) => string | undefined, base: Base, replace: Replace): Promise<string> {
  for (const match of [...text.matchAll(pattern)].reverse()) {
    const reference = group(match);
    if (reference === undefined || !local(reference)) continue;
    const replacement = await replace(reference, base);
    if (replacement === null) continue;
    const rewritten = match[0].replace(reference, replacement);
    text = text.slice(0, match.index) + rewritten + text.slice(match.index! + match[0].length);
  }
  return text;
}

/** A script's loads: imports against `imports`, page loads against the page. A path built at runtime is refused. */
async function script(text: string, file: string, imports: Base, replace: Replace): Promise<string> {
  const built = SCRIPT_BUILT.exec(text);
  if (built) throw new KinottaError('invalid', `Graphic dependency cannot be frozen: ${basename(file)} builds a file path while it runs (${built[0].trim()}…). Name the file with a literal path so Save can keep it.`);
  return each(await each(text, SCRIPT_IMPORT, (m) => m[2], imports, replace), SCRIPT_LOAD, (m) => m[2], 'page', replace);
}

/** Every local reference in one HTML, CSS or script file, rewritten through `replace`. */
async function references(text: string, file: string, replace: Replace): Promise<string> {
  const extension = extname(file).toLowerCase();
  if (extension === '.css') return each(text, CSS_REFERENCE, (m) => m[1] ?? m[2], 'file', replace);
  if (extension !== '.html') return script(text, file, 'file', replace);
  // Script bodies are set aside first, so the attribute pass never reads `img.src = …` in a script as markup.
  const scripts: string[] = [];
  text = text.replace(INLINE_SCRIPT, (_whole, open: string, body: string, close: string) => `${open}${SCRIPT_MARK}${scripts.push(body) - 1}${SCRIPT_MARK}${close}`);
  text = await each(text, HTML_REFERENCE, (m) => m[1] ?? m[2], 'page', replace);
  for (const match of [...text.matchAll(HTML_SRCSET)].reverse()) {
    const candidates: string[] = [];
    for (const candidate of match[2]!.split(',')) {
      const [reference = '', ...descriptor] = candidate.trim().split(/\s+/);
      candidates.push([local(reference) ? (await replace(reference, 'page')) ?? reference : reference, ...descriptor].join(' '));
    }
    const rewritten = `srcset=${match[1]}${candidates.join(', ')}${match[1]}`;
    text = text.slice(0, match.index) + rewritten + text.slice(match.index! + match[0].length);
  }
  const bodies: string[] = [];
  for (const body of scripts) bodies.push(await script(body, file, 'page', replace));
  return text.replace(new RegExp(`${SCRIPT_MARK}(\\d+)${SCRIPT_MARK}`, 'g'), (_whole, index: string) => bodies[Number(index)]!);
}

/**
 * Snapshot the local files a graphic uses into the version (AM33): HTML/CSS references, srcset candidates, and literal
 * loads in inline and separate scripts, recursively, rewritten to the frozen copies. A reference outside the project
 * (a scheme, `//` or `/`) or a load built at runtime cannot be frozen and is refused, so Save never publishes a version
 * whose graphics depend on files it did not keep. References are read relative to the file that names them.
 */
export function graphicPreserver(versionDir: string): (file: string) => Promise<string> {
  const copied = new Map<string, string>();
  async function preserve(file: string): Promise<string> {
    const absolute = resolve(file);
    const previous = copied.get(absolute);
    if (previous) return previous;
    const name = `${copied.size}-${basename(absolute)}`;
    copied.set(absolute, name);
    await mkdir(join(versionDir, FOLDER), { recursive: true });
    if (!CODE_FILES.includes(extname(absolute).toLowerCase())) {
      await copyFile(absolute, join(versionDir, FOLDER, name));
      return name;
    }
    // Frozen files sit together in the folder; what resolves against the page (the version root) names the folder too.
    const text = await references(await readFile(absolute, 'utf8'), absolute, async (reference, base) => {
      const frozen = await preserve(resolve(dirname(absolute), reference.split(/[?#]/)[0]!));
      return base === 'page' ? `${FOLDER}/${frozen}` : frozen;
    });
    await writeFile(join(versionDir, FOLDER, name), text, 'utf8');
    return name;
  }
  return async (file) => `${FOLDER}/${await preserve(file)}`;
}

/**
 * Freezes what a copied authored page (`index.html` in `pageDir`) uses from outside its version folder (AM33): those
 * files are copied into `dependencies/` and the references rewritten, as the version was copied with everything inside
 * it. Files inside the folder keep their paths and are read for their own references in turn. An external reference or
 * a path built at runtime is refused.
 */
export async function freezePageDependencies(pageDir: string): Promise<void> {
  const root = resolve(pageDir);
  const inside = (file: string): boolean => {
    const path = relative(root, file);
    return path !== '' && !path.startsWith('..') && !isAbsolute(path);
  };
  const freeze = graphicPreserver(root);
  const visited = new Set<string>();
  async function visit(file: string): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    const before = await readFile(file, 'utf8');
    const after = await references(before, file, async (reference, base) => {
      const from = base === 'page' ? root : dirname(file);
      const target = resolve(from, reference.split(/[?#]/)[0]!);
      if (inside(target)) {
        if (CODE_FILES.includes(extname(target).toLowerCase()) && (await exists(target))) await visit(target);
        return null;
      }
      if (!(await exists(target))) throw new KinottaError('invalid', `Graphic dependency cannot be frozen: ${reference} is missing.`);
      return posix(relative(from, join(root, await freeze(target))));
    });
    if (after !== before) await writeFile(file, after, 'utf8');
  }
  await visit(join(root, 'index.html'));
}
