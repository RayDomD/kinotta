import { defineConfig } from '@playwright/test';
import { port as fixturePort, projectFile } from './tests/e2e/ports.ts';

const E2E_PORT = fixturePort('shared');
/** A second server with its own temp project, for the specs that save comments and so change what it holds. */
const PINS_PORT = fixturePort('pins');

/** A third one for batch.spec.ts, which also reads the batch file from the temp project's folder. */
const BATCH_PORT = fixturePort('batch');
const BATCH_PROJECT_FILE = projectFile('batch');

/** A fourth for versions.spec.ts, which adds a version folder to the temp project while the editor is open. */
const VERSIONS_PORT = fixturePort('versions');
const VERSIONS_PROJECT_FILE = projectFile('versions');
/** A fourth one for footage.spec.ts, started on the footage-project sample (a reel with footage and a transcript). */
const FOOTAGE_PORT = fixturePort('footage');

/** A fifth for editing.spec.ts, which edits and deletes comments and writes the reel note. */
const EDITING_PORT = fixturePort('editing');

/** A sixth for contract.spec.ts, started on the broken-project sample (versions that break the timing contract). */
const CONTRACT_PORT = fixturePort('contract');
const CONTRACT_PROJECT_FILE = projectFile('contract');

/** A sixth for section-batches.spec.ts: the footage sample, copies per section and a version added while the editor is open. */
const SECTION_BATCHES_PORT = fixturePort('sectionBatches');
const SECTION_BATCHES_PROJECT_FILE = projectFile('section-batches');

/** A seventh for engine.spec.ts: the engine-project sample, its clips built by the motion engine at start. */
const ENGINE_PORT = fixturePort('engine');
/** An eighth for engine-compose.spec.ts: the broll-project sample, the six-clip example composed over stand-in footage. */
const BROLL_PORT = fixturePort('broll');

/** A ninth for new-reel.spec.ts: the footage sample with a fake transcriber, since a reel is started in it. */
const NEW_REEL_PORT = fixturePort('newReel');

/** A tenth for review.spec.ts: the footage sample with a fake transcriber, since it starts reels and adds a version to the project. */
const REVIEW_PORT = fixturePort('review');
const REVIEW_PROJECT_FILE = projectFile('review');

/** An eleventh for snip-save.spec.ts: the footage sample with a fake transcriber, since it starts a reel and saves a version of it. */
const SNIP_SAVE_PORT = fixturePort('snipSave');
const SNIP_SAVE_PROJECT_FILE = projectFile('snip-save');

/** A twelfth for clips.spec.ts: the footage sample as it is (four clips), whose agent-built reel is trimmed, slid and saved. */
const CLIPS_PORT = fixturePort('clips');
const CLIPS_PROJECT_FILE = projectFile('clips');

/** A thirteenth for code-only.spec.ts: the showreel sample (code-only reels), whose newest version gets element moves saved. */
const CODE_ONLY_PORT = fixturePort('codeOnly');
const CODE_ONLY_PROJECT_FILE = projectFile('code-only');

/** A fourteenth for handoff.spec.ts: the footage sample as it is, whose agent-built reel has a batch copied and then Save tried. */
const HANDOFF_PORT = fixturePort('handoff');
const HANDOFF_PROJECT_FILE = projectFile('handoff');

/** A fifteenth for transcription.spec.ts: the footage sample with a transcriber that holds its words until the spec lets them go. */
const TRANSCRIPTION_PORT = fixturePort('transcription');
const TRANSCRIPTION_PROJECT_FILE = projectFile('transcription');

/** A sixteenth for drop-video.spec.ts: the footage sample with a fake transcriber; a dropped video is copied into its footage/ folder. */
const DROP_VIDEO_PORT = fixturePort('dropVideo');

/** A seventeenth for brief-reel.spec.ts: the footage sample with a fake transcriber, where reels are started from a brief and from a video. */
const BRIEF_REEL_PORT = fixturePort('briefReel');
const BRIEF_REEL_PROJECT_FILE = projectFile('brief-reel');

/** An eighteenth for picker.spec.ts: the showreel sample, whose versions are approved and rendered. */
const PICKER_PORT = fixturePort('picker');
/** A nineteenth for renders.spec.ts: the showreel sample, where renders are queued, followed from other tabs and cancelled. */
const RENDERS_PORT = fixturePort('renders');

// Servers start through a shell, so they watch the Playwright runner's pid, not their parent's, to exit with it.
const serverEnv = (port: number) => ({ KINOTTA_E2E_PORT: String(port), KINOTTA_E2E_RUNNER_PID: String(process.pid) });

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  // Two browsers at a time locally: the default (half the cores) has run the machine out of memory mid-suite.
  workers: process.env.CI ? undefined : 2,
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
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${TRANSCRIPTION_PORT}`,
      env: { ...serverEnv(TRANSCRIPTION_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_GATED_TRANSCRIBER: '1', KINOTTA_E2E_PROJECT_FILE: TRANSCRIPTION_PROJECT_FILE },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${DROP_VIDEO_PORT}`,
      env: { ...serverEnv(DROP_VIDEO_PORT), KINOTTA_E2E_FIXTURE: 'footage-project', KINOTTA_E2E_FAKE_TRANSCRIBER: '1' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${BRIEF_REEL_PORT}`,
      env: {
        ...serverEnv(BRIEF_REEL_PORT),
        KINOTTA_E2E_FIXTURE: 'footage-project',
        KINOTTA_E2E_FAKE_TRANSCRIBER: '1',
        KINOTTA_E2E_PROJECT_FILE: BRIEF_REEL_PROJECT_FILE,
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${PICKER_PORT}`,
      env: { ...serverEnv(PICKER_PORT), KINOTTA_E2E_FIXTURE: 'showreel-project' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/start-server.mjs',
      url: `http://localhost:${RENDERS_PORT}`,
      env: { ...serverEnv(RENDERS_PORT), KINOTTA_E2E_FIXTURE: 'showreel-project' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
