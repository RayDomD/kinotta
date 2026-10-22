import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_API_TARGET = 'http://localhost:4317';
const dependencyRoot = dirname(dirname(createRequire(import.meta.url).resolve('vite/package.json')));

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), dependencyRoot] },
    proxy: { '/api': DEV_API_TARGET, '/reels': DEV_API_TARGET, '/media': DEV_API_TARGET },
  },
});
