import { defineConfig } from '@playwright/test';

const E2E_PORT = 4399;
/** A second server with its own temp project, for the specs that save comments and so change what it holds. */
const PINS_PORT = 4398;

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
  ],
});
