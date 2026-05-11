import type { ObserverConfig } from '@observer/config';
import type { SnapshotRecord } from '@observer/core';
import type { RegressionFinding } from '@observer/analyzers';

function pctDelta(before: number, after: number): number {
  if (before === 0) return after === 0 ? 0 : 100;
  return Math.round(((after - before) / before) * 100);
}

function diffAdded(before: string[], after: string[]): string[] {
  const prev = new Set(before);
  return after.filter((x) => !prev.has(x));
}

function shouldIgnorePair(pair: string[], ignored: string[]): boolean {
  const key = pair.join(' ');
  return ignored.some((p) => key.includes(p));
}

function mergeIgnored(config: ObserverConfig): string[] {
  return [...config.ignoredPaths, ...(config.ignoredFolders ?? [])];
}

export function detectRegressions(
  previous: SnapshotRecord | null,
  current: SnapshotRecord,
  config: ObserverConfig
): RegressionFinding[] {
  if (!previous) return [];

  const findings: RegressionFinding[] = [];
  const ignore = mergeIgnored(config);

  if (previous.bundle && current.bundle) {
    const deltaBytes = current.bundle.totalBytes - previous.bundle.totalBytes;
    const d = pctDelta(previous.bundle.totalBytes, current.bundle.totalBytes);
    if (deltaBytes > 0 && (deltaBytes >= config.bundleAbsBytes.info || d >= config.bundlePct.info)) {
      findings.push({
        kind: 'bundle-size',
        message: `Bundle size grew by ${d}% (${previous.bundle.totalBytes} → ${current.bundle.totalBytes} bytes, rendered; Δ ${deltaBytes} B)`,
        deltaPercent: d,
        deltaBytes
      });
    }

    const vendorDelta = current.bundle.vendorBytes - previous.bundle.vendorBytes;
    const vd = pctDelta(previous.bundle.vendorBytes, current.bundle.vendorBytes);
    if (vendorDelta > 0 && vd >= config.vendorPct.warning) {
      findings.push({
        kind: 'vendor-size',
        message: `Vendor/node_modules footprint grew by ${vd}% (Δ ${vendorDelta} B)`,
        deltaPercent: vd,
        deltaBytes: vendorDelta
      });
    }
  }

  if (previous.lighthouse && current.lighthouse) {
    const b = previous.lighthouse.performance;
    const a = current.lighthouse.performance;
    if (b != null && a != null && b - a >= config.lighthouseDrop.info) {
      findings.push({
        kind: 'lighthouse-performance',
        message: `Lighthouse performance changed from ${b} → ${a} (Δ ${a - b})`,
        before: b,
        after: a
      });
    }
  }

  if (previous.knip && current.knip) {
    const newFiles = diffAdded(previous.knip.unusedFiles, current.knip.unusedFiles);
    if (newFiles.length) {
      findings.push({
        kind: 'knip-unused-files',
        message: `${newFiles.length} new unused file(s) vs previous run`,
        added: newFiles
      });
    }

    const newExports = diffAdded(previous.knip.unusedExports, current.knip.unusedExports);
    if (newExports.length) {
      findings.push({
        kind: 'knip-unused-exports',
        message: `${newExports.length} new unused export(s) vs previous run`,
        added: newExports
      });
    }

    const newDeps = diffAdded(previous.knip.unusedDependencies, current.knip.unusedDependencies);
    if (newDeps.length) {
      findings.push({
        kind: 'knip-unused-deps',
        message: `${newDeps.length} new unused dependency signal(s) vs previous run`,
        added: newDeps
      });
    }
  }

  if (previous.dependency && current.dependency) {
    const prevKey = new Set(previous.dependency.circular.map((p) => p.slice().sort().join('<->')));
    const addedPairs = current.dependency.circular.filter(
      (p) => !prevKey.has(p.slice().sort().join('<->')) && !shouldIgnorePair(p, ignore)
    );
    if (addedPairs.length) {
      findings.push({
        kind: 'dependency-cycles',
        message: `Circular dependency regression: ${addedPairs.length} new flagged edge pair(s)`,
        addedPairs
      });
    }
  }

  return findings;
}
