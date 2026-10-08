import { defineConfig } from '@playwright/test';
import review from './review-e2e.config.ts';

export default defineConfig({
  ...review,
  testMatch: ['**/brief-reel.spec.ts'],
  grep: undefined,
  webServer: (Array.isArray(review.webServer) ? review.webServer : []).filter((server) => server.url && new URL(server.url).port === '4387'),
});
