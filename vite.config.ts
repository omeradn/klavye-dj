import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Single-file build: AudioWorklet modules are emitted as separate files by Vite.
 * Turn them into data: URLs inside index.html so the build really is one file.
 */
function inlineWorklets(): Plugin {
  return {
    name: 'inline-worklets',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const worklets = Object.values(bundle).filter(f => /-processor-[\w-]+\.js$/.test(f.fileName));
      for (const w of worklets) {
        const code = w.type === 'chunk' ? w.code : String(w.source);
        const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
        const name = w.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`new URL\\(\\s*[\`'"](?:\\./)?${name}[\`'"]\\s*,\\s*import\\.meta\\.url\\s*\\)\\.href`, 'g');
        for (const f of Object.values(bundle)) {
          if (f === w) continue;
          if (f.type === 'chunk') f.code = f.code.replace(re, JSON.stringify(dataUrl));
          else if (typeof f.source === 'string') f.source = f.source.replace(re, JSON.stringify(dataUrl));
        }
        delete bundle[w.fileName];
      }
    },
  };
}

// `npm run build`        -> dist/        (normal web build, later PWA)
// `npm run build:single` -> dist-single/ (one self-contained index.html)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [svelte(), ...(mode === 'single' ? [viteSingleFile(), inlineWorklets()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
