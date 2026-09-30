import { useMemo } from 'react';
import type { Shot, Version } from './api/index.ts';
import { useSeekProblems } from './stage/index.ts';
import type { SeekProblem } from './stage/index.ts';

/** A seek time belongs to a shot when it is within this many seconds of the shot's start. */
const SAME_TIME = 1e-6;

/** The version's contract issues in plain words: the server's static ones, then what the stage found running the page. */
export interface VersionIssues {
  /** Static and runtime messages together, each once. */
  messages: string[];
  /** Only the ones this browser saw, which the server cannot know. Sent along when the batch includes issues. */
  runtime: string[];
  /** Why a shot cannot render at all, by shot number. */
  unavailable: ReadonlyMap<string, string>;
}

function runtimeMessage(problem: SeekProblem, shots: Shot[]): string {
  if (problem.kind === 'no-seek') return 'the page has no global seek(seconds) function';
  const shot = shots.find((s) => Math.abs(s.start - problem.time) < SAME_TIME);
  return `${shot ? `shot ${shot.number}: ` : ''}seek(${problem.time}) threw: ${problem.detail}`;
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function useVersionIssues(version: Version | undefined, pageUrl: string): VersionIssues {
  const problems = useSeekProblems(pageUrl);
  return useMemo(() => {
    const shots = version?.shots ?? [];
    const runtime = problems.map((p) => runtimeMessage(p, shots));
    const statics = version?.issues ?? [];
    const unavailable = new Map<string, string>();
    for (const issue of statics) {
      if (issue.code === 'scene-gap' && issue.shot !== undefined) unavailable.set(issue.shot, capitalised(issue.message.replace(/^shot \S+: /, '')));
    }
    return { messages: [...new Set([...statics.map((i) => i.message), ...runtime])], runtime, unavailable };
  }, [version, problems]);
}
