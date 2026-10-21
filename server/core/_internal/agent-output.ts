import { pieceMap, type Piece } from './pieces.ts';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse } from 'node-html-parser';
import { checkShotsAgainstPage, checkShotsFile, scanVersionPage } from './contract.ts';
import { validateAgentPage } from './runner.ts';

/** Agent output is self-contained: no symlinks, remote dependencies or escaping file references. */
export async function validateAgentOutput(output: string, signal: AbortSignal, expectedPlan?: Record<string, unknown>, expectedTranscript?: string): Promise<void> {
  const root = resolve(output);
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('Agent output must be a real private directory.');
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir)) {
      const file = join(dir, entry);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error('Agent output contains a symbolic link.');
      if (info.isDirectory()) await walk(file);
      else if (info.isFile()) files.push(file);
      else throw new Error('Agent output contains an unsupported file.');
    }
  }
  await walk(root);
  const local = async (reference: string, base: string, allowDirectory = false): Promise<void> => {
    if (/^(?:data:|#)/i.test(reference)) return;
    if (/^(?:[a-z]+:|\/\/|\/)/i.test(reference)) throw new Error('Agent output references an external asset.');
    const file = resolve(base, decodeURIComponent(reference.split(/[?#]/)[0]!));
    const path = relative(root, file);
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`) || !(await stat(file).then((s) => s.isFile() || (allowDirectory && s.isDirectory()), () => false))) throw new Error('Agent output references a missing or escaping asset.');
  };
  for (const file of files) {
    if (!['.html', '.css', '.js', '.mjs'].includes(extname(file))) continue;
    const text = await readFile(file, 'utf8');
    let code = text;
    if (extname(file) === '.html') {
      const dom = parse(text);
      if (dom.querySelector('base') || dom.querySelector('[srcset]')) throw new Error('Agent output uses unsupported asset indirection.');
      code = [...dom.querySelectorAll('script, style').map((node) => node.text), ...dom.querySelectorAll('[style]').map((node) => node.getAttribute('style') ?? '')].join('\n');
      for (const element of dom.querySelectorAll('*')) {
        for (const attribute of ['src', 'href', 'poster', 'xlink:href']) {
          const ref = element.getAttribute(attribute);
          if (ref) await local(ref, dirname(file));
        }
      }
    }
    for (const match of code.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)|\b(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']|@import\s+["']([^"']+)["']/g)) await local((match[1] ?? match[2] ?? match[3])!, dirname(file));
  }
  const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
  if (expectedPlan) for (const key of ['pieces', 'duration', 'captions', 'sections', 'video', 'transcript']) {
    if (JSON.stringify(plan[key]) !== JSON.stringify(expectedPlan[key])) throw new Error(`Agent output changed the existing ${key}.`);
  }
  if (expectedTranscript !== undefined && await readFile(join(root, 'transcript.json'), 'utf8') !== expectedTranscript) throw new Error('Agent output changed the existing transcript.');
  if (!Array.isArray(plan.clips) || !plan.clips.length) throw new Error('Agent output has no b-roll clips.');
  for (const key of ['video', 'transcript']) if (typeof plan[key] === 'string') await local(plan[key], root);
  for (const clip of plan.clips) if (typeof clip.clip === 'string') await local(clip.clip, root, !!clip.template);
  for (const source of plan.media?.sources ?? []) if (typeof source.path === 'string') await local(source.path, root);
  const manifest = JSON.parse(await readFile(join(root, 'shots.json'), 'utf8'));
  const shots = checkShotsFile(manifest, null);
  if (expectedPlan && Math.abs(manifest.duration - pieceMap(expectedPlan.pieces as Piece[] | undefined, Number(expectedPlan.duration)).length) > 0.01) throw new Error('Agent output changed the reel timeline duration.');
  if (!(manifest.duration > 0) || !shots.shots.length) throw new Error('Agent output has no playable shots.');
  const page = await scanVersionPage(await readFile(join(root, 'index.html'), 'utf8'), root, root);
  const issues = [...shots.issues, ...page.issues, ...checkShotsAgainstPage(shots.shots, page.scenes)];
  if (issues.length) throw new Error(`Agent output breaks the page contract: ${issues[0]!.message}`);
  await validateAgentPage(join(root, 'index.html'), manifest.duration, signal);
}
