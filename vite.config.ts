import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_API_TARGET = 'http://localhost:4317';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: { proxy: { '/api': DEV_API_TARGET, '/reels': DEV_API_TARGET, '/media': DEV_API_TARGET } },
});
