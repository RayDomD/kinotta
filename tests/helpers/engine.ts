import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const SKILL_DIR = resolve(import.meta.dirname, '../../skill/kinotta');
const BUILD_SCRIPT = join(SKILL_DIR, 'engine', 'build.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

/** An example clip fragment shipped with the skill, by file name. */
export const exampleClip = (name: string): string => join(SKILL_DIR, 'examples', 'opus-aoe2', name);

/** Builds a clip fragment with the engine's build.py and writes the page to `outFile`. */
export function buildClip(fragment: string, outFile: string): void {
  const outDir = mkdtempSync(join(tmpdir(), 'kinotta-engine-'));
  const run = spawnSync(PYTHON, [BUILD_SCRIPT, outDir, fragment], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`build.py failed: ${run.stderr || run.error?.message}`);
  copyFileSync(join(outDir, basename(fragment)), outFile);
}

/** The engine-project sample's reels and the example clip each one's v1 is built from. */
const ENGINE_REELS: Record<string, string> = { 'opus-drop': '01-opus-drop.html', 'effort-slider': '03-effort-slider.html' };

/** Builds each engine-project reel's clip into its v1 page. */
export function buildEngineProject(projectDir: string): void {
  for (const [reel, clip] of Object.entries(ENGINE_REELS)) {
    buildClip(exampleClip(clip), join(projectDir, 'reels', reel, 'v1', 'index.html'));
  }
}
