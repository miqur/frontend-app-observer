import type { SnapshotRecord } from '@observer/core';
import type { HistoryComparison } from './types.js';

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildHistoryComparison(lastDesc: SnapshotRecord[], windowSize: number): HistoryComparison {
  const windowRuns = lastDesc.slice(0, Math.max(1, windowSize));
  const previous = lastDesc[1] ?? null;

  const bundleTotals = windowRuns.map((r) => r.bundle?.totalBytes ?? null).filter((n): n is number => n != null);
  const vendor = windowRuns.map((r) => r.bundle?.vendorBytes ?? null).filter((n): n is number => n != null);
  const perf = windowRuns.map((r) => r.lighthouse?.performance ?? null).filter((n): n is number => n != null);
  const exportsCount = windowRuns.map((r) => r.knip?.unusedExports.length ?? null).filter((n): n is number => n != null);

  return {
    previous,
    windowRuns,
    averageLast10: {
      bundleTotalBytes: mean(bundleTotals),
      vendorBytes: mean(vendor),
      lighthousePerformance: mean(perf),
      unusedExports: mean(exportsCount)
    },
    best: {
      minBundleBytes: bundleTotals.length ? Math.min(...bundleTotals) : null,
      maxLighthousePerformance: perf.length ? Math.max(...perf) : null,
      minUnusedExports: exportsCount.length ? Math.min(...exportsCount) : null
    }
  };
}

export function toChronological(runsNewestFirst: SnapshotRecord[]): SnapshotRecord[] {
  return [...runsNewestFirst].reverse();
}
