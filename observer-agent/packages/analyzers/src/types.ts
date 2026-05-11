import type { ObserverConfig } from '@observer/config';
import type { SnapshotRecord } from '@observer/core';

export type Trend = 'improving' | 'stable' | 'degrading';

export type Severity = 'info' | 'warning' | 'critical';

export type RegressionKind =
  | 'bundle-size'
  | 'vendor-size'
  | 'lighthouse-performance'
  | 'knip-unused-exports'
  | 'knip-unused-files'
  | 'knip-unused-deps'
  | 'dependency-cycles'
  | 'trend-bundle'
  | 'trend-lighthouse'
  | 'trend-unused-exports';

export interface RegressionFinding {
  kind: RegressionKind;
  message: string;
  deltaPercent?: number;
  deltaBytes?: number;
  before?: number | null;
  after?: number | null;
  added?: string[];
  addedPairs?: string[][];
}

export interface BudgetViolation {
  id: 'budget-total-bundle' | 'budget-vendor' | 'budget-lighthouse-performance';
  message: string;
  severity: Severity;
}

export interface ReportIssue {
  source: 'regression' | 'budget' | 'trend';
  severity: Severity;
  kind: RegressionKind | BudgetViolation['id'];
  message: string;
  recommendation: string;
}

export interface TrendSnapshot {
  bundleSize: Trend;
  lighthousePerformance: Trend;
  unusedExports: Trend;
  bundleGrowingStreak: number;
  lighthouseDecliningStreak: number;
  unusedExportsGrowingStreak: number;
  bundleVsAvgPct: number | null;
  lighthouseVsAvgPoints: number | null;
  unusedExportsVsAvgRatio: number | null;
}

export interface HistoryComparison {
  previous: SnapshotRecord | null;
  windowRuns: SnapshotRecord[];
  averageLast10: {
    bundleTotalBytes: number | null;
    vendorBytes: number | null;
    lighthousePerformance: number | null;
    unusedExports: number | null;
  };
  best: {
    minBundleBytes: number | null;
    maxLighthousePerformance: number | null;
    minUnusedExports: number | null;
  };
}

export interface HealthScorecard {
  overall: number;
  bundle: number;
  performance: number;
  techDebt: number;
  dependencies: number;
  overallTrend: Trend;
  weightsUsed: ObserverConfig['weights'];
}
