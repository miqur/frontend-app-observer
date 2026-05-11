import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  project: ['src/**/*.{ts,svelte}', 'vite.config.ts', 'svelte.config.js'],
  ignore: ['**/observer-agent/**'],
  vite: { config: 'vite.config.ts' }
};

export default config;
