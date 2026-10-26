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
  const cutsPath = join(root, 'cuts.json');
  const cutsExist = await stat(cutsPath).then((s) => s.isFile(), () => false);
  if (cutsExist) {
    let parsed: any;
    try {
      parsed = JSON.parse(await readFile(cutsPath, 'utf8'));
    } catch {
      throw new Error('Agent output cuts.json is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cuts) || parsed.cuts.length > 200) {
      throw new Error('Agent output cuts must be an array of at most 200 items.');
    }
    const cuts = parsed.cuts;
    const duration = Number(expectedPlan?.duration ?? plan.duration);
    for (const cut of cuts) {
      if (
        !cut ||
        typeof cut !== 'object' ||
        typeof cut.from !== 'number' ||
        !Number.isFinite(cut.from) ||
        typeof cut.to !== 'number' ||
        !Number.isFinite(cut.to) ||
        cut.from < 0 ||
        cut.from >= cut.to ||
        cut.to > duration
      ) {
        throw new Error('Agent output cut times must be finite numbers with 0 <= from < to <= plan duration.');
      }
      if (typeof cut.reason !== 'string' || cut.reason.length === 0 || cut.reason.length > 120) {
        throw new Error('Agent output cut reason must be a non-empty string of at most 120 characters.');
      }
    }
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i].from <= cuts[i - 1].from || cuts[i].from < cuts[i - 1].to) {
        throw new Error('Agent output cuts must be sorted by from and not overlap.');
      }
    }
    let words: { start?: number; end?: number }[] = [];
    try {
      const transcriptRaw = expectedTranscript ?? (await readFile(join(root, 'transcript.json'), 'utf8').catch(() => ''));
      if (transcriptRaw) {
        const parsedTranscript = JSON.parse(transcriptRaw);
        if (Array.isArray(parsedTranscript?.words)) words = parsedTranscript.words;
      }
    } catch {}
    for (const cut of cuts) {
      for (const word of words) {
        if (typeof word.start === 'number' && typeof word.end === 'number') {
          if (cut.from > word.start && cut.from < word.end) {
            throw new Error('Agent output cut from (' + cut.from + ') starts inside a transcript word (' + word.start + ' to ' + word.end + ').');
          }
          if (cut.to > word.start && cut.to < word.end) {
            throw new Error('Agent output cut to (' + cut.to + ') ends inside a transcript word (' + word.start + ' to ' + word.end + ').');
          }
        }
      }
    }
  }
  const manifest = JSON.parse(await readFile(join(root, 'shots.json'), 'utf8'));
  const shots = checkShotsFile(manifest, null);
  if (expectedPlan && Math.abs(manifest.duration - pieceMap(expectedPlan.pieces as Piece[] | undefined, Number(expectedPlan.duration)).length) > 0.01) throw new Error('Agent output changed the reel timeline duration.');
  if (!(manifest.duration > 0) || !shots.shots.length) throw new Error('Agent output has no playable shots.');
  const page = await scanVersionPage(await readFile(join(root, 'index.html'), 'utf8'), root, root);
  const issues = [...shots.issues, ...page.issues, ...checkShotsAgainstPage(shots.shots, page.scenes)];
  if (issues.length) throw new Error(`Agent output breaks the page contract: ${issues[0]!.message}`);
  await validateAgentPage(join(root, 'index.html'), manifest.duration, signal);
}
