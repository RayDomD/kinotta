import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_API_TARGET = 'http://localhost:4317';
// The server rejects writes whose Origin is not its own, so the proxy presents the API origin instead of Vite's.
const DEV_PROXY = { target: DEV_API_TARGET, changeOrigin: true, headers: { origin: DEV_API_TARGET } };
const dependencyRoot = dirname(dirname(createRequire(import.meta.url).resolve('vite/package.json')));

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), dependencyRoot] },
    proxy: { '/api': DEV_PROXY, '/reels': DEV_PROXY, '/media': DEV_PROXY },
  },
});
