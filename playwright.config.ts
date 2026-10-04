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

/** A sixth for section-batches.spec.ts: the footage sample, copies per section and a version added while the editor is open. */
const SECTION_BATCHES_PORT = 4392;
const SECTION_BATCHES_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-section-batches-project.txt');

/** A seventh for engine.spec.ts: the engine-project sample, its clips built by the motion engine at start. */
const ENGINE_PORT = 4391;
/** An eighth for engine-compose.spec.ts: the broll-project sample, the six-clip example composed over stand-in footage. */
const BROLL_PORT = 4390;

/** A ninth for new-reel.spec.ts: the footage sample with a fake transcriber, since a reel is started in it. */
const NEW_REEL_PORT = 4389;

/** A tenth for review.spec.ts: the footage sample with a fake transcriber, since it starts reels and adds a version to the project. */
const REVIEW_PORT = 4386;
const REVIEW_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-review-project.txt');

/** An eleventh for snip-save.spec.ts: the footage sample with a fake transcriber, since it starts a reel and saves a version of it. */
const SNIP_SAVE_PORT = 4385;
const SNIP_SAVE_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-snip-save-project.txt');

/** A twelfth for clips.spec.ts: the footage sample as it is (four clips), whose agent-built reel is trimmed, slid and saved. */
const CLIPS_PORT = 4384;
const CLIPS_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-clips-project.txt');

/** A thirteenth for code-only.spec.ts: the showreel sample (code-only reels), whose newest version gets element moves saved. */
const CODE_ONLY_PORT = 4383;
const CODE_ONLY_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-code-only-project.txt');

/** A fourteenth for handoff.spec.ts: the footage sample as it is, whose agent-built reel has a batch copied and then Save tried. */
const HANDOFF_PORT = 4382;
const HANDOFF_PROJECT_FILE = join(tmpdir(), 'kinotta-e2e-handoff-project.txt');

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
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${SECTION_BATCHES_PORT}`,
      env: {
        ...serverEnv(SECTION_BATCHES_PORT),
        KINOTTA_E2E_FIXTURE: 'footage-project',
        KINOTTA_E2E_PROJECT_FILE: SECTION_BATCHES_PROJECT_FILE,
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${ENGINE_PORT}`,
      env: { ...serverEnv(ENGINE_PORT), KINOTTA_E2E_FIXTURE: 'engine-project' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${BROLL_PORT}`,
      env: { ...serverEnv(BROLL_PORT), KINOTTA_E2E_FIXTURE: 'broll-project' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${NEW_REEL_PORT}`,
      env: { ...serverEnv(NEW_REEL_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_FAKE_TRANSCRIBER: '1' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${REVIEW_PORT}`,
      env: { ...serverEnv(REVIEW_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_FAKE_TRANSCRIBER: '1', KINOTTA_E2E_PROJECT_FILE: REVIEW_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${SNIP_SAVE_PORT}`,
      env: { ...serverEnv(SNIP_SAVE_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_FAKE_TRANSCRIBER: '1', KINOTTA_E2E_PROJECT_FILE: SNIP_SAVE_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${CLIPS_PORT}`,
      env: { ...serverEnv(CLIPS_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_PROJECT_FILE: CLIPS_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${CODE_ONLY_PORT}`,
      env: { ...serverEnv(CODE_ONLY_PORT), KINOTTA_E2E_FIXTURE: 'showreel-project', KINOTTA_E2E_PROJECT_FILE: CODE_ONLY_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${HANDOFF_PORT}`,
      env: { ...serverEnv(HANDOFF_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_PROJECT_FILE: HANDOFF_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
