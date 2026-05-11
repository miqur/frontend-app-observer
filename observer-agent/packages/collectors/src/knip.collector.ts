import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CollectorHealth, KnipMetrics } from '@observer/core';
import type { CollectorRunContext } from './collector-context.js';

type KnipJsonIssue = {
  file?: string;
  exports?: Array<{ name: string; line: number; col?: number }>;
  types?: Array<{ name: string; line: number; col?: number }>;
  dependencies?: string[];
  devDependencies?: string[];
};

type KnipJsonRoot = {
  files?: string[];
  issues?: KnipJsonIssue[];
};

function pickTsConfigRelative(projectRoot: string): string | null {
  for (const name of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.src.json']) {
    if (fs.existsSync(path.join(projectRoot, name))) return name;
  }
  return null;
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    const last = trimmed.lastIndexOf('}');
    if (last > 0) return trimmed.slice(0, last + 1);
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function parseKnipJson(stdout: string): { data: KnipJsonRoot | null; error?: string } {
  const blob = extractJsonObject(stdout);
  if (!blob) return { data: null, error: 'no JSON object in stdout' };
  try {
    return { data: JSON.parse(blob) as KnipJsonRoot };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function toKnipMetrics(data: KnipJsonRoot | null): KnipMetrics {
  const unusedFiles = new Set<string>(data?.files ?? []);
  const unusedExports: string[] = [];
  const unusedDependencies = new Set<string>();

  for (const issue of data?.issues ?? []) {
    const file = issue.file;
    if (!file) continue;

    for (const ex of issue.exports ?? []) {
      unusedExports.push(`${ex.name} @ ${file}:${ex.line}`);
    }
    for (const t of issue.types ?? []) {
      unusedExports.push(`type ${t.name} @ ${file}:${t.line}`);
    }
    for (const d of issue.dependencies ?? []) unusedDependencies.add(d);
    for (const d of issue.devDependencies ?? []) unusedDependencies.add(d);
  }

  return {
    unusedFiles: [...unusedFiles].sort(),
    unusedExports: unusedExports.sort(),
    unusedDependencies: [...unusedDependencies].sort(),
    collectedAt: new Date().toISOString()
  };
}

export async function collectKnipMetrics(
  projectRoot: string,
  ctx: CollectorRunContext
): Promise<{ metrics: KnipMetrics; health: CollectorHealth }> {
  const tsRel = pickTsConfigRelative(projectRoot);
  const npxArgs = ['--yes', 'knip', '--reporter', 'json', '--no-progress', '--no-exit-code'];
  if (tsRel) {
    npxArgs.push('--tsConfig', tsRel, '--use-tsconfig-files');
  }
  if (ctx.debug) npxArgs.push('--debug');

  ctx.logVerbose('knip: spawn args', { args: npxArgs, tsConfig: tsRel ?? '(none)', cwd: projectRoot });

  const result = spawnSync('npx', npxArgs, {
    cwd: projectRoot,
    shell: true,
    encoding: 'utf-8',
    maxBuffer: 80 * 1024 * 1024
  });

  const stdout = `${result.stdout ?? ''}`;
  const stderr = `${result.stderr ?? ''}`;

  const rawPaths: string[] = [];
  try {
    rawPaths.push(ctx.writeRaw('knip-stdout.txt', stdout.slice(0, 40_000_000)));
    if (stderr.trim()) rawPaths.push(ctx.writeRaw('knip-stderr.txt', stderr.slice(0, 4_000_000)));
  } catch {
    /* ignore */
  }

  try {
    rawPaths.push(
      ctx.writeRaw(
        'knip-invocation.json',
        JSON.stringify({ npxArgs, exitCode: result.status, tsConfig: tsRel }, null, 2)
      )
    );
  } catch {
    /* ignore */
  }

  const parsed = parseKnipJson(stdout);
  const metrics = toKnipMetrics(parsed.data);

  if (!parsed.data) {
    const health: CollectorHealth = {
      status: 'failed',
      detail: `Knip JSON parse failed: ${parsed.error ?? 'unknown'} (exit ${result.status}). See knip-stdout.txt in raw session.`,
      rawPaths: rawPaths.length ? rawPaths : undefined
    };
    ctx.logVerbose('knip: parse failed', { error: parsed.error, exit: result.status });
    return { metrics: toKnipMetrics(null), health };
  }

  const hasIssues =
    metrics.unusedFiles.length + metrics.unusedExports.length + metrics.unusedDependencies.length > 0;
  const health: CollectorHealth =
    result.status !== 0 && !hasIssues
      ? {
          status: 'partial',
          detail: `Knip exited ${result.status} but JSON was parsed; results may be incomplete. stderr: ${stderr.slice(0, 300)}`,
          rawPaths
        }
      : {
          status: 'success',
          detail: tsRel ? `tsconfig: ${tsRel}` : 'no tsconfig.json (defaults)',
          rawPaths
        };

  ctx.logDebug('knip: summary', {
    unusedFiles: metrics.unusedFiles.length,
    unusedExports: metrics.unusedExports.length,
    unusedDeps: metrics.unusedDependencies.length
  });

  return { metrics, health };
}
