export type CollectorHealthStatus = 'success' | 'partial' | 'failed';

/** Per-collector outcome for reports and debugging (stored on snapshot). */
export interface CollectorHealth {
  status: CollectorHealthStatus;
  /** Human-readable reason or diagnostics summary */
  detail?: string;
  /** Absolute paths to persisted raw outputs when available */
  rawPaths?: string[];
}

export interface SnapshotCollectorHealth {
  bundle?: CollectorHealth;
  lighthouse?: CollectorHealth;
  knip?: CollectorHealth;
  dependency?: CollectorHealth;
}

export interface BundleMetrics {
  totalBytes: number;
  gzipBytes: number | null;
  largestChunks: { name: string; bytes: number }[];
  duplicatedPackages: string[];
  vendorBytes: number;
  collectedAt: string;
  source:
    | 'rollup-plugin-visualizer-raw-data'
    | 'dist-scan'
    /** Multi-root scan when dist/ is empty (e.g. SvelteKit only .svelte-kit/output) */
    | 'output-scan';
}

export interface LighthouseMetrics {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  collectedAt: string;
  runUrl?: string;
}

export interface KnipMetrics {
  unusedFiles: string[];
  unusedExports: string[];
  unusedDependencies: string[];
  collectedAt: string;
}

export interface DependencyMetrics {
  circular: string[][];
  maxDepth: number;
  couplingHotspots: { module: string; incoming: number }[];
  violationCount: number;
  collectedAt: string;
}

/** One persisted analysis snapshot for a project. */
export interface SnapshotRecord {
  id: number;
  createdAt: string;
  commitHash: string;
  branch: string;
  bundle: BundleMetrics | null;
  lighthouse: LighthouseMetrics | null;
  knip: KnipMetrics | null;
  dependency: DependencyMetrics | null;
  /** Present when stored (schema v3+). */
  collectorHealth?: SnapshotCollectorHealth | null;
}
