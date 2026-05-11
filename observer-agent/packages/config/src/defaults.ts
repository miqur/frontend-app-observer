import type { CollectorId } from '@observer/shared';
import { isCollectorId } from '@observer/shared';

export interface ObserverConfig {
  bundleAbsBytes: { info: number; warning: number; critical: number };
  bundlePct: { info: number; warning: number; critical: number };
  vendorPct: { warning: number; critical: number };
  lighthouseDrop: { info: number; warning: number; critical: number };
  trends: {
    windowRuns: number;
    minRunsForTrend: number;
    consecutiveBundleGrowth: number;
    consecutiveLighthouseDrop: number;
    consecutiveUnusedExportsGrowth: number;
    vsAverageEpsilon: number;
  };
  weights: {
    bundle: number;
    performance: number;
    techDebt: number;
    dependencies: number;
  };
  budgets: {
    maxTotalBundleBytes: number | null;
    maxVendorBytes: number | null;
    minLighthousePerformance: number | null;
  };
  ignoredPaths: string[];
  /** Extra path substrings to ignore in Knip / tooling when supported */
  ignoredFolders?: string[];
  /** Lighthouse: static folder passed to LHCI (relative to project root). If omitted, auto-detects `dist/`, `build/`, `.svelte-kit/output/client/`, `.svelte-kit/output/`. */
  lighthouse?: {
    staticDistDir?: string;
  };
  /** Override detected build; must produce `statsOutputPath` or a static output dir for Lighthouse */
  build?: {
    command?: string;
    /** Absolute or project-relative path to rollup visualizer raw JSON after build */
    statsOutputPath?: string;
    env?: Record<string, string>;
  };
  /** dependency-cruiser entry (folder under project root) */
  dependency?: {
    entry?: string;
    cruiserConfigPath?: string;
  };
  /** Collectors to skip for this repository (no writes into the target besides normal tool outputs). */
  disabledCollectors: CollectorId[];
}

const defaultConfig: ObserverConfig = {
  bundleAbsBytes: {
    info: 2 * 1024,
    warning: 120 * 1024,
    critical: 350 * 1024
  },
  bundlePct: {
    info: 2,
    warning: 8,
    critical: 18
  },
  vendorPct: {
    warning: 10,
    critical: 22
  },
  lighthouseDrop: {
    info: 3,
    warning: 7,
    critical: 12
  },
  trends: {
    windowRuns: 10,
    minRunsForTrend: 4,
    consecutiveBundleGrowth: 5,
    consecutiveLighthouseDrop: 4,
    consecutiveUnusedExportsGrowth: 4,
    vsAverageEpsilon: 0.03
  },
  weights: {
    bundle: 0.28,
    performance: 0.28,
    techDebt: 0.24,
    dependencies: 0.2
  },
  budgets: {
    maxTotalBundleBytes: 500 * 1024,
    maxVendorBytes: 250 * 1024,
    minLighthousePerformance: 85
  },
  ignoredPaths: [],
  disabledCollectors: []
};

export function defineObserverConfig(overrides: Partial<ObserverConfig>): ObserverConfig {
  return {
    ...defaultConfig,
    ...overrides,
    bundleAbsBytes: { ...defaultConfig.bundleAbsBytes, ...overrides.bundleAbsBytes },
    bundlePct: { ...defaultConfig.bundlePct, ...overrides.bundlePct },
    vendorPct: { ...defaultConfig.vendorPct, ...overrides.vendorPct },
    lighthouseDrop: { ...defaultConfig.lighthouseDrop, ...overrides.lighthouseDrop },
    trends: { ...defaultConfig.trends, ...overrides.trends },
    weights: { ...defaultConfig.weights, ...overrides.weights },
    budgets: { ...defaultConfig.budgets, ...overrides.budgets },
    ignoredPaths: overrides.ignoredPaths ?? defaultConfig.ignoredPaths,
    ignoredFolders: overrides.ignoredFolders ?? defaultConfig.ignoredFolders,
    build: overrides.build ? { ...overrides.build } : defaultConfig.build,
    dependency: overrides.dependency ? { ...overrides.dependency } : defaultConfig.dependency,
    lighthouse: overrides.lighthouse ? { ...overrides.lighthouse } : undefined,
    disabledCollectors: normalizeDisabledCollectors(overrides.disabledCollectors)
  };
}

function normalizeDisabledCollectors(list: CollectorId[] | undefined): CollectorId[] {
  if (!list?.length) return [];
  return [...new Set(list.filter((x): x is CollectorId => isCollectorId(String(x))))];
}

export const defaultObserverConfig: ObserverConfig = defineObserverConfig({});
