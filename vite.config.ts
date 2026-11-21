import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/        (normal web build, later PWA)
// `npm run build:single` -> dist-single/ (one self-contained index.html)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [svelte(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
