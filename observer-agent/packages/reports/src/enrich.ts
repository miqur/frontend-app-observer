import type { ObserverConfig } from '@observer/config';
import type {
  BudgetViolation,
  RegressionFinding,
  ReportIssue,
  Severity
} from '@observer/analyzers';
function maxSeverity(a: Severity, b: Severity): Severity {
  const rank = { info: 0, warning: 1, critical: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function severityForRegression(finding: RegressionFinding, config: ObserverConfig): Severity {
  switch (finding.kind) {
    case 'dependency-cycles':
      return 'critical';
    case 'bundle-size': {
      const abs = finding.deltaBytes ?? 0;
      const pct = finding.deltaPercent ?? 0;
      if (abs >= config.bundleAbsBytes.critical || pct >= config.bundlePct.critical) return 'critical';
      if (abs >= config.bundleAbsBytes.warning || pct >= config.bundlePct.warning) return 'warning';
      return 'info';
    }
    case 'vendor-size': {
      const pct = finding.deltaPercent ?? 0;
      if (pct >= config.vendorPct.critical) return 'critical';
      if (pct >= config.vendorPct.warning) return 'warning';
      return 'info';
    }
    case 'lighthouse-performance': {
      const drop = (finding.before ?? 0) - (finding.after ?? 0);
      if (drop >= config.lighthouseDrop.critical) return 'critical';
      if (drop >= config.lighthouseDrop.warning) return 'warning';
      return 'info';
    }
    case 'knip-unused-exports': {
      const n = finding.added?.length ?? 0;
      if (n >= 30) return 'critical';
      if (n >= 14) return 'warning';
      return 'info';
    }
    case 'knip-unused-files': {
      const n = finding.added?.length ?? 0;
      if (n >= 12) return 'critical';
      if (n >= 5) return 'warning';
      return 'info';
    }
    case 'knip-unused-deps': {
      const n = finding.added?.length ?? 0;
      if (n >= 6) return 'critical';
      if (n >= 3) return 'warning';
      return 'info';
    }
    case 'trend-bundle':
      return 'warning';
    case 'trend-lighthouse':
      return 'warning';
    case 'trend-unused-exports':
      return 'info';
    default:
      return 'info';
  }
}

function recommendationFor(finding: RegressionFinding): string {
  switch (finding.kind) {
    case 'bundle-size':
      return 'Review the largest chunks in the bundle report and remove or lazy-load heavy modules (e.g. charts, editors, maps).';
    case 'vendor-size':
      return 'Consider dynamic `import()` for large vendor features, dedupe dependencies, or replace bulky libraries with lighter alternatives.';
    case 'lighthouse-performance':
      return 'Profile the critical path: reduce JS on the landing route, defer third parties, and verify images/fonts are optimized.';
    case 'knip-unused-exports':
      return 'Run a focused cleanup (delete or inline unused exports) before release; Knip can drive incremental PR-sized fixes.';
    case 'knip-unused-files':
      return 'Delete dead files or wire them into the module graph if they are meant to ship.';
    case 'knip-unused-deps':
      return 'Remove unused packages from package.json and reinstall to shrink install + supply-chain risk.';
    case 'dependency-cycles':
      return 'Break the cycle by extracting shared types/helpers to a neutral module or inverting the dependency direction.';
    case 'trend-bundle':
      return 'Treat this as a sustained regression: schedule a bundle budget review and bisect recent dependency or route changes.';
    case 'trend-lighthouse':
      return 'Investigate recent UI or network changes; compare Lighthouse traces between the first and last run in the streak.';
    case 'trend-unused-exports':
      return 'Adopt a routine Knip cleanup so unused surface area does not accumulate across PRs.';
    default:
      return 'Review the finding in context of recent commits and prioritize based on severity.';
  }
}

export function toReportIssues(args: {
  regressions: RegressionFinding[];
  budgetViolations: BudgetViolation[];
  config: ObserverConfig;
}): ReportIssue[] {
  const issues: ReportIssue[] = [];

  for (const v of args.budgetViolations) {
    issues.push({
      source: 'budget',
      severity: v.severity,
      kind: v.id,
      message: v.message,
      recommendation:
        v.id === 'budget-total-bundle'
          ? 'Shrink entry bundles: code-split routes, audit dependencies, and enforce import boundaries.'
          : v.id === 'budget-vendor'
            ? 'Move large vendor-only code behind dynamic imports or replace with smaller packages.'
            : 'Improve main-thread work: reduce long tasks, defer non-critical scripts, and check LCP element priority.'
    });
  }

  for (const f of args.regressions) {
    issues.push({
      source: f.kind.startsWith('trend-') ? 'trend' : 'regression',
      severity: severityForRegression(f, args.config),
      kind: f.kind,
      message: f.message,
      recommendation: recommendationFor(f)
    });
  }

  return issues;
}

function highestExitSeverity(issues: ReportIssue[]): Severity | null {
  return issues.reduce<Severity | null>((acc, cur) => (acc ? maxSeverity(acc, cur.severity) : cur.severity), null);
}

export function exitCodeFromIssues(issues: ReportIssue[]): 0 | 1 | 2 {
  const hi = highestExitSeverity(issues);
  if (hi === 'critical') return 2;
  if (hi === 'warning') return 1;
  return 0;
}
