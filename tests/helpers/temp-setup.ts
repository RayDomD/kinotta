import type { TestProject } from 'vitest/node';
import { createRunRoot, removeTempRoot, RUN_ROOT_ENV, sweepStaleTempRoots } from './temp.ts';

export default function setup(project: TestProject) {
  sweepStaleTempRoots();
  const root = createRunRoot();
  // Project-specific env prevents projects in the same invocation sharing a root.
  project.config.env = { ...project.config.env, [RUN_ROOT_ENV]: root };
  // Vitest runs global teardown before closing its worker pool. Windows watchers
  // can still hold folders then, so retry our own root after the pool closes too.
  project.vitest.onClose(() => removeTempRoot(root));
  return () => removeTempRoot(root);
}
