#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli', { paths: [repoRoot, path.join(repoRoot, 'apps', 'cli')] });
const entry = path.join(repoRoot, 'apps', 'cli', 'src', 'index.ts');

const r = spawnSync(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: repoRoot,
  env: process.env
});

process.exit(r.status === null ? 1 : r.status);
