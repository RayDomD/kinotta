import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Plan } from './edit-model.ts';
import { KinottaError } from './errors.ts';
import { readReelFootage } from './footage.ts';

const PLAN_FILE = 'plan.json';
const TRANSCRIPT_FILE = 'transcript.json';
/** Where an agent keeps the plan it builds a footage reel from (the skill's composing step). */
const MOTION_DIR = 'motion';

/** The files a reel is built from, and so the files Save writes edits into. */
export interface ReelSources {
  plan: Plan;
  /** Absolute path of the plan; its relative paths (video, clips, transcript) are relative to its folder. */
  planFile: string;
  planDir: string;
  /** Absolute path of the transcript the reel's words are in, or null when the reel has none. */
  transcriptFile: string | null;
}

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8')) as unknown;

async function exists(file: string): Promise<boolean> {
  return readFile(file).then(() => true, () => false);
}

/**
 * The one place that decides which plan a reel is built from. A reel with a `plan.json` in its folder (started in
 * Kinotta) builds from that; a footage reel without one (built by an agent) builds from the project's `motion/plan.json`,
 * the same plan the skill composes. A reel that is neither has no plan Kinotta can edit: code-only reels are T40's.
 */
export async function readReelPlan(projectDir: string, reelDir: string): Promise<ReelSources> {
  const own = join(reelDir, PLAN_FILE);
  const shared = join(projectDir, MOTION_DIR, PLAN_FILE);
  let planFile: string | null = null;
  if (await exists(own)) planFile = own;
  else if ((await readReelFootage(projectDir, reelDir)) !== null && (await exists(shared))) planFile = shared;
  if (planFile === null) {
    throw new KinottaError('invalid', 'This reel is built from code, with no plan Kinotta can edit. Only reels built over footage can be edited so far.');
  }
  let plan: Plan;
  try {
    plan = (await readJson(planFile)) as Plan;
  } catch {
    throw new KinottaError('invalid', `The reel's plan (${planFile}) could not be read.`);
  }
  const planDir = dirname(planFile);
  const named = typeof plan.transcript === 'string' ? resolve(planDir, plan.transcript) : null;
  const fallback = join(reelDir, TRANSCRIPT_FILE);
  const transcriptFile = named ?? ((await exists(fallback)) ? fallback : null);
  return { plan, planFile, planDir, transcriptFile };
}
