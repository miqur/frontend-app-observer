import type { RegressionHistoryEntry } from './regression-history.js';
import type { HistoryComparison, HealthScorecard, ReportIssue, TrendSnapshot } from '@observer/analyzers';
import type { RegressionFinding } from '@observer/analyzers';
import type { SnapshotRecord } from '@observer/core';

export interface ObserverReportContext {
  projectPath: string;
  projectName: string;
  current: SnapshotRecord;
  history: HistoryComparison;
  trends: TrendSnapshot;
  scorecard: HealthScorecard;
  issues: ReportIssue[];
  regressions: RegressionFinding[];
  regressionHistory: RegressionHistoryEntry[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function linesForRun(run: SnapshotRecord): string[] {
  const lines: string[] = [];
  lines.push(`Run #${run.id} @ ${run.createdAt}`);
  lines.push(`Commit ${run.commitHash.slice(0, 7)} on ${run.branch}`);

  if (run.bundle) {
    lines.push('');
    lines.push('Bundle');
    lines.push(`- Total (rendered): ${formatBytes(run.bundle.totalBytes)}`);
    if (run.bundle.gzipBytes != null) lines.push(`- Total (gzip est.): ${formatBytes(run.bundle.gzipBytes)}`);
    lines.push(`- Vendor (node_modules est.): ${formatBytes(run.bundle.vendorBytes)}`);
    lines.push(`- Source: ${run.bundle.source}`);
    lines.push(`- Largest chunks:`);
    for (const c of run.bundle.largestChunks.slice(0, 5)) {
      lines.push(`  - ${c.name}: ${formatBytes(c.bytes)}`);
    }
    if (run.bundle.duplicatedPackages.length) {
      lines.push(`- Packages split across multiple module paths (heuristic): ${run.bundle.duplicatedPackages.slice(0, 8).join(', ')}`);
    }
  }

  if (run.lighthouse) {
    lines.push('');
    lines.push('Lighthouse (CI, static dist)');
    lines.push(
      `- Performance / A11y / Best practices / SEO: ${run.lighthouse.performance ?? 'n/a'} / ${run.lighthouse.accessibility ?? 'n/a'} / ${run.lighthouse.bestPractices ?? 'n/a'} / ${run.lighthouse.seo ?? 'n/a'}`
    );
    lines.push(
      `- LCP / CLS / TBT: ${run.lighthouse.lcpMs != null ? `${run.lighthouse.lcpMs.toFixed(0)} ms` : 'n/a'} / ${run.lighthouse.cls ?? 'n/a'} / ${run.lighthouse.tbtMs != null ? `${run.lighthouse.tbtMs.toFixed(0)} ms` : 'n/a'}`
    );
  }

  if (run.knip) {
    lines.push('');
    lines.push('Knip (unused code & deps)');
    lines.push(`- Unused files: ${run.knip.unusedFiles.length}`);
    lines.push(`- Unused exports: ${run.knip.unusedExports.length}`);
    lines.push(`- Unused dependencies: ${run.knip.unusedDependencies.length}`);
  }

  if (run.dependency) {
    lines.push('');
    lines.push('Dependency graph');
    lines.push(`- Max dependency depth (src-only heuristic): ${run.dependency.maxDepth}`);
    lines.push(`- Cruiser violations: ${run.dependency.violationCount}`);
    lines.push(`- Circular pairs flagged: ${run.dependency.circular.length}`);
    lines.push(`- Top coupling (incoming from src):`);
    for (const h of run.dependency.couplingHotspots.slice(0, 5)) {
      lines.push(`  - ${h.module}: ${h.incoming}`);
    }
  }

  if (run.collectorHealth && Object.keys(run.collectorHealth).length) {
    lines.push('');
    lines.push('Collector status');
    for (const [id, h] of Object.entries(run.collectorHealth)) {
      if (!h) continue;
      const raw = h.rawPaths?.length ? ` | raw: ${h.rawPaths.length} file(s)` : '';
      lines.push(`- ${id}: ${h.status}${h.detail ? ` — ${h.detail}` : ''}${raw}`);
    }
  }

  return lines;
}

export function buildTerminalReport(ctx: ObserverReportContext): string {
  const lines: string[] = [];
  lines.push('=== Observer agent report ===', '');
  lines.push(`Project: ${ctx.projectName}`);
  lines.push(`Path: ${ctx.projectPath}`);
  lines.push('');

  lines.push('--- Health score ---');
  lines.push(`Project health: ${ctx.scorecard.overall}/100 (trend: ${ctx.scorecard.overallTrend})`);
  lines.push(
    `Breakdown — bundle: ${ctx.scorecard.bundle}, performance: ${ctx.scorecard.performance}, tech debt: ${ctx.scorecard.techDebt}, dependencies: ${ctx.scorecard.dependencies}`
  );
  lines.push('');

  lines.push('--- History (window) ---');
  const avg = ctx.history.averageLast10;
  lines.push(
    `Avg of last ${ctx.history.windowRuns.length} runs — bundle: ${avg.bundleTotalBytes != null ? formatBytes(avg.bundleTotalBytes) : 'n/a'}, vendor: ${avg.vendorBytes != null ? formatBytes(avg.vendorBytes) : 'n/a'}, LH perf: ${avg.lighthousePerformance?.toFixed(1) ?? 'n/a'}, unused exports: ${avg.unusedExports?.toFixed(1) ?? 'n/a'}`
  );
  const best = ctx.history.best;
  lines.push(
    `Best in window — smallest bundle: ${best.minBundleBytes != null ? formatBytes(best.minBundleBytes) : 'n/a'}, best LH perf: ${best.maxLighthousePerformance ?? 'n/a'}, fewest unused exports: ${best.minUnusedExports ?? 'n/a'}`
  );
  lines.push('');

  lines.push('--- Trends ---');
  lines.push(
    `Bundle: ${ctx.trends.bundleSize} (streak ↑ ${ctx.trends.bundleGrowingStreak}), vs avg: ${ctx.trends.bundleVsAvgPct != null ? `${ctx.trends.bundleVsAvgPct.toFixed(1)}%` : 'n/a'}`
  );
  lines.push(
    `Lighthouse perf: ${ctx.trends.lighthousePerformance} (streak ↓ ${ctx.trends.lighthouseDecliningStreak}), vs avg: ${ctx.trends.lighthouseVsAvgPoints != null ? `${ctx.trends.lighthouseVsAvgPoints.toFixed(1)} pts` : 'n/a'}`
  );
  lines.push(
    `Unused exports: ${ctx.trends.unusedExports} (streak ↑ ${ctx.trends.unusedExportsGrowingStreak}), vs avg ratio: ${ctx.trends.unusedExportsVsAvgRatio != null ? `${(ctx.trends.unusedExportsVsAvgRatio * 100).toFixed(1)}%` : 'n/a'}`
  );
  lines.push('');

  lines.push('--- Issues (severity) ---');
  if (!ctx.issues.length) {
    lines.push('None above configured thresholds.');
  } else {
    for (const issue of ctx.issues) {
      lines.push(`[${issue.severity.toUpperCase()}] ${issue.message}`);
      lines.push(`  → ${issue.recommendation}`);
    }
  }
  lines.push('');

  lines.push('--- Snapshot ---');
  lines.push(...linesForRun(ctx.current));
  lines.push('');

  lines.push('--- Regression history (recent pairs) ---');
  if (!ctx.regressionHistory.length) {
    lines.push('No pairwise regressions detected in the scanned window.');
  } else {
    for (const h of ctx.regressionHistory.slice(0, 8)) {
      lines.push(`Run #${h.newerRunId} vs #${h.olderRunId}:`);
      for (const m of h.messages.slice(0, 6)) lines.push(`  - ${m}`);
      if (h.messages.length > 6) lines.push('  - …');
    }
  }

  lines.push('');
  return lines.join('\n');
}
