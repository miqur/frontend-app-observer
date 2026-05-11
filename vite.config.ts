import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import { observerDbApiPlugin } from './vite-plugin-observer-api';

const observerBundle =
  process.env.OBSERVER_BUNDLE === '1' || process.env.OBSERVABILITY_BUNDLE === '1';

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const env = loadEnv(mode, root, '');
  const ob = env.OBSERVER_DATA_DIR?.trim();
  if (ob) {
    process.env.OBSERVER_DATA_DIR = path.isAbsolute(ob) ? ob : path.resolve(root, ob);
  }

  return {
    plugins: [
      svelte(),
      observerDbApiPlugin(),
      observerBundle &&
        visualizer({
          filename: '.observer/cache/bundle-raw.json',
          template: 'raw-data',
          gzipSize: true,
          brotliSize: true,
          open: false
        })
    ].filter(Boolean)
  };
});