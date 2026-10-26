import { buildPage } from './build-runner.ts';
import { KinottaError } from './errors.ts';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readBrandFonts } from './brand-fonts.ts';
import { readReelStyle } from './style.ts';
import { readTitle } from './reels.ts';
import type { FramePin, Version } from './types.ts';

const SKILL = resolve(import.meta.dirname, '../../../skill/kinotta');

/** Accept explicit Brand token tables or CSS declarations; unspecified tokens keep built-in values. */
function tokensFromBrand(text: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of text.matchAll(/\|[^\n]*?`--(fx-[a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|/g)) tokens[match[1]!] = match[2]!;
  for (const match of text.matchAll(/--(fx-[a-z0-9-]+)\s*:\s*([^;{}\n]+);/g)) tokens[match[1]!] = match[2]!.trim();
  return tokens;
}

/** Local templates only: this service deliberately does not import runner.ts or agent-jobs.ts. */
export async function makeInstantEffect(projectDir: string, slug: string, effect: string, pin: FramePin, version: Version): Promise<string> {
  const style = await readReelStyle(projectDir, slug);
  const fonts = await readBrandFonts(projectDir);
  const builtIn = await readFile(join(SKILL, 'assets/brand/brand.md'), 'utf8');
  const brand = await readFile(join(projectDir, 'reels/brand.md'), 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return ''; throw error; });
  const tokens = { ...tokensFromBrand(builtIn), ...tokensFromBrand(brand), 'fx-font': JSON.stringify(style?.fonts?.words ?? fonts.words) };
  const shot = version.shots.find((shot) => shot.number === pin.shot);
  if (!shot) throw new KinottaError('invalid', 'Choose an existing shot for this effect.');
  const section = version.sections.find((section) => section.id === pin.section) ?? version.sections[0];
  const sectionNumber = section ? version.sections.indexOf(section) + 1 : 1;
  const fill = effect === 'title-card' ? { title: await readTitle(join(projectDir, 'reels', slug)) ?? slug, subtitle: '' }
    : effect === 'section-tag' ? { number: String(sectionNumber), label: section?.name ?? shot.title }
    : { number: String(sectionNumber) };
  const duration = pin.alternate ? shot.alternates?.find((alt) => alt.revision === pin.alternate)?.duration ?? shot.duration : shot.duration;
  const dir = await mkdtemp(join(tmpdir(), 'kinotta-instant-'));
  try {
    const plan = join(dir, 'plan.json'), page = join(dir, 'index.html');
    await writeFile(plan, JSON.stringify({ duration, brand: { tokens }, clips: [{ id: 'pinned-effect', template: effect, in: 0, out: duration, fill }] }));
    await buildPage(plan, page);
    return await readFile(page, 'utf8');
  } finally { await rm(dir, { recursive: true, force: true }); }
}
