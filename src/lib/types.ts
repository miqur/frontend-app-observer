export type Project = {
  id: number;
  path: string;
  slug: string;
  name: string;
  packageManager: string | null;
  framework: string | null;
  hasVite: number;
  hasTypeScript: number;
  buildCommand: string | null;
  updatedAt: string;
};

export type SnapshotRow = {
  id: number;
  projectId: number;
  createdAt: string;
  commitHash: string;
  branch: string;
  bundle: { totalBytes: number; vendorBytes: number; source: string } | null;
  lighthouse: { performance: number | null; accessibility: number | null } | null;
  knip: { unusedFiles: number; unusedExports: number; unusedDependencies: number } | null;
  dependency: { maxDepth: number; violationCount: number; circularCount: number } | null;
  collectorHealth: Record<string, { status: string; detail?: string }> | null;
};

export type ObserverHealth = {
  dataDir: string;
  dbPath: string;
  exists: boolean;
  homedir?: string;
  envObserverDataDir?: string | null;
  projectCount?: number;
  snapshotCount?: number;
  dbError?: string;
};
