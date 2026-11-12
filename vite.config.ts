import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 8787}` },
  },
  // The map library alone is about 1 MB minified, so the default 500 kB warning is noise.
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 1500 },
  // maplibre-gl starts its worker as an ES module.
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
