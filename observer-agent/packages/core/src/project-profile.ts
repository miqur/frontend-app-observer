export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export type DetectedFramework =
  | 'next'
  | 'svelte'
  | 'svelte-kit'
  | 'react'
  | 'vue'
  | 'unknown';

export interface ProjectProfile {
  /** Absolute path to repository root */
  root: string;
  name: string;
  packageManager: PackageManager;
  framework: DetectedFramework;
  hasVite: boolean;
  hasTypeScript: boolean;
  /** Primary source folder for dependency-cruiser / heuristics */
  sourceRoot: string;
  /** Scripts from package.json */
  scripts: Record<string, string>;
  /** Preferred build for analysis (first match wins) */
  defaultAnalyzeBuildCommand: string;
}
