/**
 * The requests Kinotta copies for whoever builds the next version of a reel. They name the reel and what is wanted,
 * and no particular agent (E20): any agent that can write a version folder can act on them.
 */

const REELS_DIR = 'reels';

/** For a reel started from a brief: build its first version. */
export function briefRequest(slug: string, title: string, brief: string): string {
  return [
    `Kinotta request: build the reel "${title}" (${REELS_DIR}/${slug}) from this brief.`,
    '',
    brief,
    '',
    `Write the first version to ${REELS_DIR}/${slug}/v1 with index.html, then shots.json last. The reel stays Waiting in Kinotta until shots.json appears.`,
    '',
  ].join('\n');
}

/** For a reel with a transcript and no clips: add b-roll in the next version. */
export function brollRequest(slug: string, title: string, number: number): string {
  const reel = `${REELS_DIR}/${slug}`;
  return [
    `Kinotta request: add b-roll to the reel "${title}" (${reel}).`,
    '',
    `v${number} has footage and a transcript (${reel}/transcript.json) but no clips yet. Plan b-roll over the spoken words, using ${reel}/plan.json.`,
    '',
    `Write the next version to ${reel}/v${number + 1} with index.html, then shots.json last.`,
    '',
  ].join('\n');
}
