import { spawnSync } from 'node:child_process';
import type { ObserverConfig } from '@observer/config';
import type { ProjectProfile } from '@observer/core';

/**
 * Runs the configured production build in the target repo (cwd = project root).
 * Used by the bundle collector and, when bundle metrics are skipped, before Lighthouse.
 */
export function runProjectProductionBuild(args: {
  projectRoot: string;
  profile: ProjectProfile;
  config: ObserverConfig;
}): void {
  const { projectRoot, profile, config } = args;
  const buildCmd = config.build?.command ?? profile.defaultAnalyzeBuildCommand;
  const env = { ...process.env, ...config.build?.env, OBSERVER_BUNDLE: '1', OBSERVABILITY_BUNDLE: '1' };

  if (process.env.OBSERVER_DEBUG === '1') {
    console.log(`[observer/debug] production build cwd=${projectRoot}`);
    console.log(`[observer/debug] command: ${buildCmd}`);
  }

  const result = spawnSync(buildCmd, {
    cwd: projectRoot,
    shell: true,
    stdio: 'inherit',
    env
  });

  if (result.status !== 0) {
    throw new Error(`Build failed (${buildCmd}) exit ${result.status ?? 'unknown'}`);
  }
}
