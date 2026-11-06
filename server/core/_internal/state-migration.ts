import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REELS_DIR, STATE_DIR } from './state.ts';

/** Folders directly under `reels/.kinotta/` that belong to the project, not to a reel. */
const PROJECT_LEVEL = new Set(['stills']);
const TEMP_FILE = /\.tmp$/;

export interface StateMigrationReport {
  /** Files moved into a reel folder. */
  moved: number;
  /** Where each old copy was set aside because the reel folder already had a different one. */
  conflicts: string[];
  /** Slugs whose old state was left in place because the reel folder does not exist. */
  orphans: string[];
}

const sameBytes = (a: string, b: string): boolean => readFileSync(a).equals(readFileSync(b));

/** Copies through a temp file and a rename, so the target is whole or absent, and checks the copy before returning. */
function copyChecked(from: string, to: string): void {
  const temp = `${to}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, readFileSync(from));
    renameSync(temp, to);
  } finally {
    rmSync(temp, { force: true });
  }
  if (!sameBytes(from, to)) throw new Error(`The copy of ${from} does not match the original.`);
}

function moveReelState(from: string, reelDir: string, report: StateMigrationReport): void {
  const to = join(reelDir, STATE_DIR);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile() || TEMP_FILE.test(entry.name)) continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    mkdirSync(to, { recursive: true });
    if (!existsSync(target)) {
      copyChecked(source, target);
      report.moved++;
    } else if (!sameBytes(source, target)) {
      const aside = join(to, `${entry.name}.conflict-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      copyChecked(source, aside);
      report.conflicts.push(aside);
    }
    rmSync(source);
  }
  try {
    rmdirSync(from);
  } catch {
    // Not empty (a temp file or folder we leave alone): nothing is lost, the next open tries again.
  }
}

/**
 * Moves each reel's saved state from `reels/.kinotta/<slug>/` into `reels/<slug>/.kinotta/`. Safe to run on every open:
 * a file is removed from the old place only after its copy is read back and matches, so a crash in between leaves both
 * copies and the next run finishes. The reel-folder copy always wins; state with no reel folder is never touched.
 */
export function migrateReelState(projectDir: string): StateMigrationReport {
  const report: StateMigrationReport = { moved: 0, conflicts: [], orphans: [] };
  const oldRoot = join(projectDir, REELS_DIR, STATE_DIR);
  let slugs: string[];
  try {
    slugs = readdirSync(oldRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !PROJECT_LEVEL.has(e.name)).map((e) => e.name);
  } catch {
    return report;
  }
  for (const slug of slugs) {
    const reelDir = join(projectDir, REELS_DIR, slug);
    if (!existsSync(reelDir)) report.orphans.push(slug);
    else moveReelState(join(oldRoot, slug), reelDir, report);
  }
  if (report.moved > 0 || report.conflicts.length > 0 || report.orphans.length > 0) console.warn('[kinotta] reel state migration', JSON.stringify(report));
  return report;
}
