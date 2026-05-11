import type { ObserverConfig } from '@observer/config';
import type { RegressionFinding, TrendSnapshot } from './types.js';

export function buildTrendFindings(trends: TrendSnapshot, config: ObserverConfig): RegressionFinding[] {
  const findings: RegressionFinding[] = [];

  if (trends.bundleGrowingStreak >= config.trends.consecutiveBundleGrowth) {
    findings.push({
      kind: 'trend-bundle',
      message: `Bundle size increased for ${trends.bundleGrowingStreak} consecutive runs (threshold ${config.trends.consecutiveBundleGrowth})`
    });
  }

  if (trends.lighthouseDecliningStreak >= config.trends.consecutiveLighthouseDrop) {
    findings.push({
      kind: 'trend-lighthouse',
      message: `Lighthouse performance declined for ${trends.lighthouseDecliningStreak} consecutive runs (threshold ${config.trends.consecutiveLighthouseDrop})`
    });
  }

  if (trends.unusedExportsGrowingStreak >= config.trends.consecutiveUnusedExportsGrowth) {
    findings.push({
      kind: 'trend-unused-exports',
      message: `Unused export count increased for ${trends.unusedExportsGrowingStreak} consecutive runs (threshold ${config.trends.consecutiveUnusedExportsGrowth})`
    });
  }

  return findings;
}
