import fs from 'node:fs';
import path from 'node:path';
import type { DetectedFramework, PackageManager, ProjectProfile } from './project-profile.js';

function readPackageJson(root: string): { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null {
  const p = path.join(root, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function mergeDeps(pkg: NonNullable<ReturnType<typeof readPackageJson>>): Record<string, string> {
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}

function detectFramework(deps: Record<string, string>): DetectedFramework {
  if (deps['next']) return 'next';
  if (deps['@sveltejs/kit']) return 'svelte-kit';
  if (deps['svelte']) return 'svelte';
  if (deps['react'] || deps['react-dom']) return 'react';
  if (deps['vue']) return 'vue';
  return 'unknown';
}

function hasVite(deps: Record<string, string>): boolean {
  return Boolean(deps['vite'] || deps['@vitejs/plugin-react'] || deps['@vitejs/plugin-vue'] || deps['@sveltejs/vite-plugin-svelte']);
}

function hasTypeScript(root: string, deps: Record<string, string>): boolean {
  if (deps['typescript']) return true;
  return fs.existsSync(path.join(root, 'tsconfig.json'));
}

function pickSourceRoot(root: string, framework: DetectedFramework): string {
  if (fs.existsSync(path.join(root, 'src'))) return 'src';
  if (framework === 'next' && fs.existsSync(path.join(root, 'app'))) return 'app';
  if (fs.existsSync(path.join(root, 'lib'))) return 'lib';
  return 'src';
}

function pickRunCommand(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bun';
    default:
      return 'npm';
  }
}

function pickBuildCommand(
  root: string,
  pm: PackageManager,
  scripts: Record<string, string>
): string {
  const run = pickRunCommand(pm);
  const exec = pm === 'npm' ? 'npm run' : pm === 'pnpm' ? 'pnpm run' : pm === 'yarn' ? 'yarn' : 'bun run';

  if (scripts['build:observer']) return `${exec} build:observer`;
  if (scripts['build:observability']) return `${exec} build:observability`;
  if (scripts['build']) return `${exec} build`;
  return `${exec} build`;
}

/**
 * Inspects a repository root and returns how collectors should run against it.
 */
export function detectProject(root: string): ProjectProfile {
  const resolved = path.resolve(root);
  const pkg = readPackageJson(resolved);
  const name = pkg?.name && typeof pkg.name === 'string' ? pkg.name : path.basename(resolved);
  const scripts = pkg?.scripts ?? {};
  const deps = pkg ? mergeDeps(pkg) : {};
  const packageManager = detectPackageManager(resolved);
  const framework = detectFramework(deps);
  const vite = hasVite(deps);
  const ts = hasTypeScript(resolved, deps);
  const sourceRoot = pickSourceRoot(resolved, framework);
  const defaultAnalyzeBuildCommand = pickBuildCommand(resolved, packageManager, scripts);

  return {
    root: resolved,
    name,
    packageManager,
    framework,
    hasVite: vite,
    hasTypeScript: ts,
    sourceRoot,
    scripts,
    defaultAnalyzeBuildCommand
  };
}
