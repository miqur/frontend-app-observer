import type { ObserverConfig } from '@observer/config';
import type { SnapshotRecord } from '@observer/core';
import type { HealthScorecard, Trend, TrendSnapshot } from './types.js';

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeWeights(w: ObserverConfig['weights']): ObserverConfig['weights'] {
  const sum = w.bundle + w.performance + w.techDebt + w.dependencies;
  if (sum <= 0) return { bundle: 0.25, performance: 0.25, techDebt: 0.25, dependencies: 0.25 };
  return {
    bundle: w.bundle / sum,
    performance: w.performance / sum,
    techDebt: w.techDebt / sum,
    dependencies: w.dependencies / sum
  };
}

function scoreBundle(current: SnapshotRecord, budget: number | null): number {
  if (!current.bundle) return 72;
  const bytes = current.bundle.totalBytes;
  if (!Number.isFinite(bytes) || bytes < 0) return 72;
  if (budget == null) {
    const soft = 1.5 * 1024 * 1024;
    return Math.round(100 * (1 - clamp01(bytes / soft) * 0.65));
  }
  if (bytes <= budget) {
    return Math.round(70 + 30 * (1 - clamp01(bytes / budget)));
  }
  const over = bytes - budget;
  const penalty = clamp01(over / budget);
  return Math.round(Math.max(0, 70 * (1 - penalty)));
}

function scorePerformance(current: SnapshotRecord): number {
  const p = current.lighthouse?.performance;
  if (p == null || !Number.isFinite(p)) return 70;
  return Math.round(Math.max(0, Math.min(100, p)));
}

function scoreTechDebt(current: SnapshotRecord): number {
  if (!current.knip) return 80;
  const unusedFiles = current.knip.unusedFiles?.length ?? 0;
  const unusedExports = current.knip.unusedExports?.length ?? 0;
  const unusedDependencies = current.knip.unusedDependencies?.length ?? 0;
  const penalty = unusedFiles * 4 + unusedExports * 1.2 + unusedDependencies * 6;
  if (!Number.isFinite(penalty)) return 75;
  return Math.round(Math.max(0, 100 - Math.min(85, penalty)));
}

function scoreDependencies(current: SnapshotRecord): number {
  if (!current.dependency) return 82;
  const circ = current.dependency.circular?.length ?? 0;
  const maxDepth = current.dependency.maxDepth ?? 0;
  const viol = current.dependency.violationCount ?? 0;
  const depthPenalty = Math.max(0, maxDepth - 6) * 4;
  const penalty = circ * 18 + depthPenalty + viol * 3;
  if (!Number.isFinite(penalty)) return 75;
  return Math.round(Math.max(0, 100 - Math.min(90, penalty)));
}

function overallTrendFromComponents(bundle: Trend, perf: Trend, debt: Trend, dep: Trend): Trend {
  const bad = [bundle, perf, debt, dep].filter((t) => t === 'degrading').length;
  const good = [bundle, perf, debt, dep].filter((t) => t === 'improving').length;
  if (bad >= 2 && good === 0) return 'degrading';
  if (good >= 2 && bad === 0) return 'improving';
  return 'stable';
}

function invertTrend(t: Trend): Trend {
  if (t === 'improving') return 'degrading';
  if (t === 'degrading') return 'improving';
  return 'stable';
}

export function computeHealthScorecard(args: {
  current: SnapshotRecord;
  trends: TrendSnapshot;
  config: ObserverConfig;
}): HealthScorecard {
  const w = normalizeWeights(args.config.weights);
  const bundle = scoreBundle(args.current, args.config.budgets.maxTotalBundleBytes);
  const performance = scorePerformance(args.current);
  const techDebt = scoreTechDebt(args.current);
  const dependencies = scoreDependencies(args.current);

  const overall = Math.round(
    (Number.isFinite(bundle) ? bundle : 0) * w.bundle +
      (Number.isFinite(performance) ? performance : 0) * w.performance +
      (Number.isFinite(techDebt) ? techDebt : 0) * w.techDebt +
      (Number.isFinite(dependencies) ? dependencies : 0) * w.dependencies
  );

  const bundleTrend = args.trends.bundleSize;
  const perfTrend = args.trends.lighthousePerformance;
  const debtTrend = invertTrend(args.trends.unusedExports);
  const depTrend: Trend =
    args.current.dependency && (args.current.dependency.circular?.length ?? 0) > 0 ? 'degrading' : 'stable';

  const overallTrend = overallTrendFromComponents(bundleTrend, perfTrend, debtTrend, depTrend);

  return {
    overall,
    bundle,
    performance,
    techDebt,
    dependencies,
    overallTrend,
    weightsUsed: w
  };
}
