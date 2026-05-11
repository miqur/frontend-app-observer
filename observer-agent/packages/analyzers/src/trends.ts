import type { SnapshotRecord } from '@observer/core';
import type { ObserverConfig } from '@observer/config';
import type { Trend, TrendSnapshot } from './types.js';
import { toChronological } from './history.js';

function directionFromSeries(values: number[], higherIsBetter: boolean, epsilon: number): Trend {
  if (values.length < 3) return 'stable';
  const latest = values[values.length - 1];
  const prior = values.slice(0, -1);
  const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (avgPrior === 0) return 'stable';
  const rel = (latest - avgPrior) / Math.abs(avgPrior);
  if (higherIsBetter) {
    if (rel > epsilon) return 'improving';
    if (rel < -epsilon) return 'degrading';
    return 'stable';
  }
  if (rel < -epsilon) return 'improving';
  if (rel > epsilon) return 'degrading';
  return 'stable';
}

function consecutiveBundleGrowthStreak(chronological: SnapshotRecord[]): number {
  const sizes = chronological.map((r) => r.bundle?.totalBytes).filter((n): n is number => n != null);
  if (sizes.length < 2) return 0;
  let streak = 0;
  for (let i = sizes.length - 1; i > 0; i--) {
    if (sizes[i] > sizes[i - 1]) streak++;
    else break;
  }
  return streak;
}

function consecutiveLighthouseDeclineStreak(chronological: SnapshotRecord[]): number {
  const scores = chronological.map((r) => r.lighthouse?.performance).filter((n): n is number => n != null);
  if (scores.length < 2) return 0;
  let streak = 0;
  for (let i = scores.length - 1; i > 0; i--) {
    if (scores[i] < scores[i - 1]) streak++;
    else break;
  }
  return streak;
}

function consecutiveUnusedExportsGrowthStreak(chronological: SnapshotRecord[]): number {
  const counts = chronological.map((r) => r.knip?.unusedExports.length ?? 0);
  if (counts.length < 2) return 0;
  let streak = 0;
  for (let i = counts.length - 1; i > 0; i--) {
    if (counts[i] > counts[i - 1]) streak++;
    else break;
  }
  return streak;
}

export function computeTrendSnapshot(
  runsNewestFirst: SnapshotRecord[],
  config: ObserverConfig
): TrendSnapshot {
  const window = Math.min(config.trends.windowRuns, runsNewestFirst.length);
  const slice = runsNewestFirst.slice(0, window);
  const chrono = toChronological(slice);

  const bundleSeries = chrono.map((r) => r.bundle?.totalBytes).filter((n): n is number => n != null);
  const lhSeries = chrono.map((r) => r.lighthouse?.performance).filter((n): n is number => n != null);
  const exportSeries = chrono.map((r) => r.knip?.unusedExports.length ?? 0);

  const eps = config.trends.vsAverageEpsilon;
  const bundleTrend =
    bundleSeries.length >= config.trends.minRunsForTrend ? directionFromSeries(bundleSeries, false, eps) : 'stable';
  const lhTrend =
    lhSeries.length >= config.trends.minRunsForTrend ? directionFromSeries(lhSeries, true, eps) : 'stable';
  const exportTrend =
    exportSeries.length >= config.trends.minRunsForTrend ? directionFromSeries(exportSeries, false, eps) : 'stable';

  const latest = runsNewestFirst[0];
  const priorAvgWindow = runsNewestFirst.slice(1, window);
  const bundlesForAvg = priorAvgWindow.map((r) => r.bundle?.totalBytes).filter((n): n is number => n != null);
  const avgBundle = bundlesForAvg.length ? bundlesForAvg.reduce((a, b) => a + b, 0) / bundlesForAvg.length : null;

  const lhForAvg = priorAvgWindow.map((r) => r.lighthouse?.performance).filter((n): n is number => n != null);
  const avgLh = lhForAvg.length ? lhForAvg.reduce((a, b) => a + b, 0) / lhForAvg.length : null;

  const avgExports =
    priorAvgWindow.length > 0
      ? priorAvgWindow.reduce((s, r) => s + (r.knip?.unusedExports.length ?? 0), 0) / priorAvgWindow.length
      : null;

  const bundleVsAvgPct =
    latest?.bundle && avgBundle != null && avgBundle > 0 ? ((latest.bundle.totalBytes - avgBundle) / avgBundle) * 100 : null;
  const lighthouseVsAvgPoints =
    latest?.lighthouse?.performance != null && avgLh != null && !Number.isNaN(avgLh)
      ? latest.lighthouse.performance - avgLh
      : null;
  const unusedExportsVsAvgRatio =
    latest?.knip && avgExports != null && avgExports > 0 ? latest.knip.unusedExports.length / avgExports - 1 : null;

  return {
    bundleSize: bundleTrend,
    lighthousePerformance: lhTrend,
    unusedExports: exportTrend,
    bundleGrowingStreak: consecutiveBundleGrowthStreak(chrono),
    lighthouseDecliningStreak: consecutiveLighthouseDeclineStreak(chrono),
    unusedExportsGrowingStreak: consecutiveUnusedExportsGrowthStreak(chrono),
    bundleVsAvgPct,
    lighthouseVsAvgPoints,
    unusedExportsVsAvgRatio
  };
}
