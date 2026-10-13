import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer subpasta do GitHub Pages.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    // O Phaser minificado tem ~1,2 MB e fica num chunk separado (cacheável).
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
