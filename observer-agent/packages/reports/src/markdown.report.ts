import type { ObserverReportContext } from './summary.generator.js';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildMarkdownReport(ctx: ObserverReportContext, generatedAtIso: string): string {
  const avg = ctx.history.averageLast10;
  const best = ctx.history.best;

  const issuesMd = ctx.issues.length
    ? ctx.issues
        .map(
          (i) =>
            `### [${i.severity}] ${i.kind}\n\n${i.message}\n\n**Recommendation:** ${i.recommendation}\n`
        )
        .join('\n')
    : '_No issues above configured thresholds._\n';

  const histMd = ctx.regressionHistory.length
    ? ctx.regressionHistory
        .slice(0, 12)
        .map((h) => {
          const bullets = h.messages.map((m) => `- ${m}`).join('\n');
          return `#### Run #${h.newerRunId} vs #${h.olderRunId}\n\n${bullets}\n`;
        })
        .join('\n')
    : '_No pairwise regressions in the scanned window._\n';

  return [
    '# Observer agent report',
    '',
    `_Project: ${ctx.projectName}_`,
    '',
    `_Path: \`${ctx.projectPath}\`_`,
    '',
    `_Generated: ${generatedAtIso}_`,
    '',
    '## Health score',
    '',
    `**Overall:** ${ctx.scorecard.overall}/100`,
    '',
    `- **Trend:** ${ctx.scorecard.overallTrend}`,
    `- **Bundle:** ${ctx.scorecard.bundle}`,
    `- **Performance:** ${ctx.scorecard.performance}`,
    `- **Tech debt:** ${ctx.scorecard.techDebt}`,
    `- **Dependencies:** ${ctx.scorecard.dependencies}`,
    '',
    '## History window',
    '',
    `- **Runs in window:** ${ctx.history.windowRuns.length}`,
    `- **Avg bundle:** ${avg.bundleTotalBytes != null ? formatBytes(avg.bundleTotalBytes) : 'n/a'}`,
    `- **Avg vendor:** ${avg.vendorBytes != null ? formatBytes(avg.vendorBytes) : 'n/a'}`,
    `- **Avg Lighthouse performance:** ${avg.lighthousePerformance?.toFixed(1) ?? 'n/a'}`,
    `- **Avg unused exports:** ${avg.unusedExports?.toFixed(1) ?? 'n/a'}`,
    '',
    '### Best values in window',
    '',
    `- **Smallest bundle:** ${best.minBundleBytes != null ? formatBytes(best.minBundleBytes) : 'n/a'}`,
    `- **Best Lighthouse performance:** ${best.maxLighthousePerformance ?? 'n/a'}`,
    `- **Fewest unused exports:** ${best.minUnusedExports ?? 'n/a'}`,
    '',
    '## Trends',
    '',
    '| Signal | Direction | Streak | vs average |',
    '| --- | --- | --- | --- |',
    `| Bundle size | ${ctx.trends.bundleSize} | ↑${ctx.trends.bundleGrowingStreak} | ${ctx.trends.bundleVsAvgPct != null ? `${ctx.trends.bundleVsAvgPct.toFixed(1)}%` : 'n/a'} |`,
    `| Lighthouse performance | ${ctx.trends.lighthousePerformance} | ↓${ctx.trends.lighthouseDecliningStreak} | ${ctx.trends.lighthouseVsAvgPoints != null ? `${ctx.trends.lighthouseVsAvgPoints.toFixed(1)} pts` : 'n/a'} |`,
    `| Unused exports | ${ctx.trends.unusedExports} | ↑${ctx.trends.unusedExportsGrowingStreak} | ${ctx.trends.unusedExportsVsAvgRatio != null ? `${(ctx.trends.unusedExportsVsAvgRatio * 100).toFixed(1)}% rel` : 'n/a'} |`,
    '',
    '## Issues & recommendations',
    '',
    issuesMd,
    '',
    '## Pairwise regression history',
    '',
    histMd,
    '',
    ...(ctx.current.collectorHealth && Object.keys(ctx.current.collectorHealth).length
      ? [
          '## Collector status',
          '',
          ...Object.entries(ctx.current.collectorHealth).flatMap(([id, h]) =>
            h
              ? [
                  `- **${id}:** ${h.status}${h.detail ? ` — ${h.detail}` : ''}${h.rawPaths?.length ? ` _(raw: ${h.rawPaths.length} file(s))_` : ''}`
                ]
              : []
          ),
          ''
        ]
      : []),
    '## Latest run snapshot',
    '',
    `- **Run:** #${ctx.current.id} @ ${ctx.current.createdAt}`,
    `- **Git:** \`${ctx.current.commitHash.slice(0, 7)}\` on \`${ctx.current.branch}\``,
    ctx.current.bundle
      ? `- **Bundle:** ${formatBytes(ctx.current.bundle.totalBytes)} (vendor ${formatBytes(ctx.current.bundle.vendorBytes)}, source ${ctx.current.bundle.source})`
      : '',
    ctx.current.lighthouse
      ? `- **Lighthouse performance:** ${ctx.current.lighthouse.performance ?? 'n/a'}`
      : '',
    ctx.current.knip
      ? `- **Knip:** ${ctx.current.knip.unusedFiles.length} unused files, ${ctx.current.knip.unusedExports.length} unused exports, ${ctx.current.knip.unusedDependencies.length} unused deps`
      : '',
    ctx.current.dependency
      ? `- **Dependencies:** ${ctx.current.dependency.circular.length} circular pairs, depth ${ctx.current.dependency.maxDepth}`
      : '',
    ''
  ]
    .filter(Boolean)
    .join('\n');
}
