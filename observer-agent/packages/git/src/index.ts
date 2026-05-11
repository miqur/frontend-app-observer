import { spawnSync } from 'node:child_process';

export function readGitMeta(projectRoot: string): { commitHash: string; branch: string } {
  const hashRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf-8' });
  const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot, encoding: 'utf-8' });
  return {
    commitHash: (hashRes.stdout ?? '').trim() || 'unknown',
    branch: (branchRes.stdout ?? '').trim() || 'unknown'
  };
}
