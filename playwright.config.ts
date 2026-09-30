import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const E2E_PORT = 4399;
/** A second server with its own temp project, for the specs that save comments and so change what it holds. */
const PINS_PORT = 4398;

/** A third one for batch.spec.ts, which also reads the batch file from the temp project's folder. */
const BATCH_PORT = 4397;
const BATCH_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-batch-project.txt');

/** A fourth for versions.spec.ts, which adds a version folder to the temp project while the editor is open. */
const VERSIONS_PORT = 4395;
const VERSIONS_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-versions-project.txt');
/** A fourth one for footage.spec.ts, started on the footage-project sample (a reel with footage and a transcript). */
const FOOTAGE_PORT = 4396;

/** A fifth for editing.spec.ts, which edits and deletes comments and writes the reel note. */
const EDITING_PORT = 4394;

/** A sixth for contract.spec.ts, started on the broken-project sample (versions that break the timing contract). */
const CONTRACT_PORT = 4393;
const CONTRACT_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-contract-project.txt');

const serverEnv = (port: number) => ({ KINOTTA_E2E_PORT: String(port) });

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  use: { baseURL: `http://localhost:${E2E_PORT}`, channel: 'chrome' },
  webServer: [
    {
      command: 'npm run build && node tests/e2e/start-server.mjs',
      url: `http://localhost:${E2E_PORT}`,
      env: serverEnv(E2E_PORT),
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${PINS_PORT}`,
      env: serverEnv(PINS_PORT),
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${BATCH_PORT}`,
      env: { ...serverEnv(BATCH_PORT), KINOTTA_E2E_PROJECT_FILE: BATCH_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${VERSIONS_PORT}`,
      env: { ...serverEnv(VERSIONS_PORT), KINOTTA_E2E_PROJECT_FILE: VERSIONS_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${FOOTAGE_PORT}`,
      env: { ...serverEnv(FOOTAGE_PORT), KINOTTA_E2E_FIXTURE: 'footage-project' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${EDITING_PORT}`,
      env: serverEnv(EDITING_PORT),
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${CONTRACT_PORT}`,
      env: { ...serverEnv(CONTRACT_PORT), KINOTTA_E2E_FIXTURE: 'broken-project', KINOTTA_E2E_PROJECT_FILE: CONTRACT_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
