import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any GitHub Pages sub-path (https://user.github.io/<repo>/)
// and when opened from any static host. Override with BASE_PATH=/repo/ if you prefer an absolute base.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 1200 },
});
