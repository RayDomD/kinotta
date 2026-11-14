import type { ContractIssue, Version } from './types.ts';

const SHOT_TYPES = ['cutaway', 'panel'];

/**
 * What a footage reel needs beyond the timing contract (T22), with the `code` each reports under:
 *
 *   footage-missing  the footage file reel.json names is not in the project
 *   transcript       transcript.json is missing or not valid
 *   shot-type        a shot's type is not cutaway or panel
 *   no-spoken-line   a shot has no line, or its line holds no transcript words
 */
function footageIssues(version: Version): ContractIssue[] {
  if (!version.footage) return [];
  const issues: ContractIssue[] = [];
  if (!version.footage.exists) {
    issues.push({ code: 'footage-missing', message: `footage file ${version.footage.path} not found` });
  }
  if (version.transcriptProblem) issues.push({ code: 'transcript', message: version.transcriptProblem });
  for (const shot of version.shots) {
    if (!SHOT_TYPES.includes(shot.type ?? '')) {
      issues.push({ code: 'shot-type', shot: shot.number, message: `shots.json: shot ${shot.number} has no type (${SHOT_TYPES.join(' or ')})` });
    }
    // With no transcript, only a missing line can be told apart; the transcript issue covers the rest.
    const silent = !shot.line || (version.transcript !== undefined && !shot.spoken);
    if (silent) issues.push({ code: 'no-spoken-line', shot: shot.number, message: `shots.json: shot ${shot.number} has no spoken line` });
  }
  return issues;
}

/**
 * Every static issue of a version (K7, R18): its timing contract issues, then a footage reel's footage problems. This is
 * the list `kinotta check` prints and the render gate refuses on, so the CLI and the editor never disagree.
 */
export const versionIssues = (version: Version): ContractIssue[] => [...version.issues, ...footageIssues(version)];
