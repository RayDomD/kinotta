import { defineConfig } from '@playwright/test';

const E2E_PORT = 4399;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  use: { baseURL: `http://localhost:${E2E_PORT}`, channel: 'chrome' },
  webServer: {
    command: 'npm run build && node tests/e2e/start-server.mjs',
    url: `http://localhost:${E2E_PORT}`,
    env: { KINOTTA_E2E_PORT: String(E2E_PORT) },
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
