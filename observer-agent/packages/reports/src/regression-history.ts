import type { ObserverConfig } from '@observer/config';
import type { SnapshotRecord } from '@observer/core';
import { detectRegressions } from './regression.detector.js';

export interface RegressionHistoryEntry {
  newerRunId: number;
  olderRunId: number;
  messages: string[];
}

export function buildRegressionHistory(
  runsNewestFirst: SnapshotRecord[],
  config: ObserverConfig,
  maxPairs: number
): RegressionHistoryEntry[] {
  const out: RegressionHistoryEntry[] = [];
  const limit = Math.min(maxPairs, Math.max(0, runsNewestFirst.length - 1));
  for (let i = 0; i < limit; i++) {
    const newer = runsNewestFirst[i];
    const older = runsNewestFirst[i + 1];
    const findings = detectRegressions(older, newer, config);
    if (!findings.length) continue;
    out.push({
      newerRunId: newer.id,
      olderRunId: older.id,
      messages: findings.map((f) => f.message)
    });
  }
  return out;
}
