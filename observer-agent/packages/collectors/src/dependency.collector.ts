import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { CollectorHealth, DependencyMetrics } from '@observer/core';
import type { ObserverConfig } from '@observer/config';
import type { ProjectProfile } from '@observer/core';
import type { CollectorRunContext } from './collector-context.js';

type DepModule = {
  source: string;
  dependencies?: Array<{ resolved: string; circular?: boolean }>;
};

type DepCruiseJson = {
  modules?: DepModule[];
  summary?: { violations?: unknown[] };
};

/** Filenames dependency-cruiser loads by default from the project root (no `--config`). */
const DEFAULT_CRUISER_CONFIG_NAMES = [
  '.dependency-cruiser.js',
  '.dependency-cruiser.cjs',
  'dependency-cruiser.config.js',
  'dependency-cruiser.config.cjs'
] as const;

function depcruiseConfigArgs(projectRoot: string, dependency?: ObserverConfig['dependency']): string[] {
  const explicit = dependency?.cruiserConfigPath?.trim();
  if (explicit) {
    if (fs.existsSync(path.join(projectRoot, explicit))) return ['--config', explicit];
    return ['--no-config'];
  }
  const hasDefault = DEFAULT_CRUISER_CONFIG_NAMES.some((n) => fs.existsSync(path.join(projectRoot, n)));
  if (hasDefault) return [];
  return ['--no-config'];
}

function normalizeModulePath(projectRoot: string, filePath: string): string {
  if (!filePath) return filePath;
  const rel = path.relative(projectRoot, path.resolve(projectRoot, filePath));
  const posix = rel.split(path.sep).join('/');
  return posix.startsWith('..') ? filePath.replaceAll('\\', '/') : posix;
}

function buildGraph(projectRoot: string, modules: DepModule[], sourcePrefix: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const prefix = sourcePrefix.endsWith('/') ? sourcePrefix : `${sourcePrefix}/`;

  for (const mod of modules) {
    const src = normalizeModulePath(projectRoot, mod.source);
    if (!graph.has(src)) graph.set(src, []);
  }

  for (const mod of modules) {
    const from = normalizeModulePath(projectRoot, mod.source);
    const outs = graph.get(from)!;
    for (const dep of mod.dependencies ?? []) {
      const to = normalizeModulePath(projectRoot, dep.resolved);
      if (!to.startsWith(prefix)) continue;
      outs.push(to);
    }
  }

  return graph;
}

function longestPathDepth(graph: Map<string, string[]>): number {
  function dfs(node: string, stack: Set<string>): number {
    if (stack.has(node)) return 0;
    stack.add(node);
    let best = 0;
    for (const next of graph.get(node) ?? []) {
      best = Math.max(best, dfs(next, stack));
    }
    stack.delete(node);
    return 1 + best;
  }

  let max = 0;
  for (const n of graph.keys()) {
    max = Math.max(max, dfs(n, new Set()));
  }
  return max;
}

function fanInCounts(graph: Map<string, string[]>): Map<string, number> {
  const incoming = new Map<string, number>();
  for (const [from, outs] of graph) {
    if (!incoming.has(from)) incoming.set(from, 0);
    for (const to of outs) {
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
    }
  }
  return incoming;
}

function extractCircularPairs(projectRoot: string, modules: DepModule[]): string[][] {
  const pairs: string[][] = [];
  const seen = new Set<string>();
  for (const mod of modules) {
    const from = normalizeModulePath(projectRoot, mod.source);
    for (const dep of mod.dependencies ?? []) {
      if (!dep.circular) continue;
      const to = normalizeModulePath(projectRoot, dep.resolved);
      const key = [from, to].sort().join('->');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([from, to]);
    }
  }
  return pairs;
}

export async function collectDependencyMetrics(args: {
  projectRoot: string;
  profile: ProjectProfile;
  config: ObserverConfig;
  ctx: CollectorRunContext;
}): Promise<{ metrics: DependencyMetrics | null; health: CollectorHealth }> {
  const { projectRoot, profile, config, ctx } = args;
  const entry = config.dependency?.entry ?? profile.sourceRoot;
  /** Always pull the real CLI so analyzed repos need not list dependency-cruiser as a devDependency. */
  const npxArgs = [
    '--yes',
    '--package=dependency-cruiser@16.9.0',
    'depcruise',
    entry,
    '--output-type',
    'json',
    ...depcruiseConfigArgs(projectRoot, config.dependency)
  ];

  ctx.logVerbose('dependency-cruiser: command', { npxArgs, cwd: projectRoot });

  const result = spawnSync('npx', npxArgs, {
    cwd: projectRoot,
    encoding: 'utf-8',
    shell: true,
    maxBuffer: 512 * 1024 * 1024
  });

  const rawPaths: string[] = [];
  try {
    rawPaths.push(
      ctx.writeRaw(
        'dependency-cruiser-invocation.json',
        JSON.stringify({ npxArgs, exitCode: result.status }, null, 2)
      )
    );
  } catch {
    /* ignore */
  }

  if (result.error) {
    const msg = `dependency-cruiser spawn failed: ${result.error.message}`;
    ctx.logVerbose('dependency-cruiser: spawn error', { message: result.error.message });
    return {
      metrics: null,
      health: { status: 'failed', detail: msg, rawPaths }
    };
  }

  const out = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  try {
    if (stderr) rawPaths.push(ctx.writeRaw('dependency-cruiser-stderr.txt', stderr.slice(0, 4_000_000)));
    if (out) rawPaths.push(ctx.writeRaw('dependency-cruiser-stdout.json', out.slice(0, 120_000_000)));
  } catch {
    /* ignore */
  }

  if (!out) {
    return {
      metrics: null,
      health: {
        status: 'failed',
        detail: `dependency-cruiser produced no stdout (exit ${result.status}). stderr: ${stderr.slice(0, 500)}`,
        rawPaths
      }
    };
  }

  let data: DepCruiseJson;
  try {
    data = JSON.parse(out) as DepCruiseJson;
  } catch (e) {
    const hint =
      out.length > 900_000
        ? ' (stdout is very large — possible buffer truncation)'
        : '';
    return {
      metrics: null,
      health: {
        status: 'failed',
        detail: `Invalid JSON from dependency-cruiser (exit ${String(result.status)}, ${out.length} bytes)${hint}: ${e instanceof Error ? e.message : String(e)}`,
        rawPaths
      }
    };
  }
  const modules = data.modules ?? [];
  const graph = buildGraph(projectRoot, modules, entry);
  const incoming = fanInCounts(graph);
  const prefix = entry.endsWith('/') ? entry : `${entry}/`;
  const hotspots = [...incoming.entries()]
    .filter(([mod]) => mod.startsWith(prefix))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([module, count]) => ({ module, incoming: count }));

  const circular = extractCircularPairs(projectRoot, modules);
  const maxDepth = longestPathDepth(graph);
  const violationCount = data.summary?.violations?.length ?? 0;

  const metrics: DependencyMetrics = {
    circular,
    maxDepth,
    couplingHotspots: hotspots,
    violationCount,
    collectedAt: new Date().toISOString()
  };

  ctx.logDebug('dependency-cruiser: parsed', {
    modules: modules.length,
    violations: violationCount,
    maxDepth
  });

  return {
    metrics,
    health: {
      status: 'success',
      detail: `${modules.length} modules`,
      rawPaths: rawPaths.length ? rawPaths : undefined
    }
  };
}
