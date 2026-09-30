import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';
import { SeekError } from './page.ts';
import type { SeekProblem } from './page.ts';

/**
 * The runtime side of the contract check: what the stage learns by driving a version page. Each still and each
 * enlarged frame reports whether its last seek worked; the UI reads the problems for one page, de-duplicated.
 */

interface Report {
  pageUrl: string;
  problem: SeekProblem;
}

const reports = new Map<string, Report>();
const listeners = new Set<() => void>();
let revision = 0;

function changed(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Records the outcome of a seek for one frame: the error it failed with, or null when it worked. */
function setOutcome(source: string, pageUrl: string, error: unknown): void {
  const problem = error instanceof SeekError ? error.problem : null;
  const before = reports.get(source);
  if (problem === null) {
    if (reports.delete(source)) changed();
    return;
  }
  if (before && before.pageUrl === pageUrl && JSON.stringify(before.problem) === JSON.stringify(problem)) return;
  reports.set(source, { pageUrl, problem });
  changed();
}

/** For a frame: the function that reports its seek outcome. The report is withdrawn when the frame goes away. */
export function useSeekReporter(pageUrl: string): (error: unknown) => void {
  const source = useId();
  useEffect(
    () => () => {
      if (reports.delete(source)) changed();
    },
    [source],
  );
  return (error) => setOutcome(source, pageUrl, error);
}

/** The seek problems of one version page, each once: a missing `seek` is one entry however many frames hit it. */
export function useSeekProblems(pageUrl: string): SeekProblem[] {
  const seen = useSyncExternalStore(subscribe, () => revision);
  return useMemo(() => {
    const unique = new Map<string, SeekProblem>();
    for (const report of reports.values()) {
      if (report.pageUrl === pageUrl) unique.set(JSON.stringify(report.problem), report.problem);
    }
    return [...unique.values()];
  }, [pageUrl, seen]);
}
