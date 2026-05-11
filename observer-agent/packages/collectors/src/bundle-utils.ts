import fs from 'node:fs';
import path from 'node:path';
import type { BundleMetrics } from '@observer/core';

type RawModuleTree = {
  name: string;
  children?: RawModuleTree[];
  uid?: string;
};

type RawBundleFile = {
  version: number;
  tree: RawModuleTree;
  nodeParts: Record<
    string,
    { renderedLength?: number; gzipLength?: number; brotliLength?: number; metaUid?: string }
  >;
  nodeMetas: Record<
    string,
    {
      id: string;
      moduleParts: Record<string, { renderedLength: number; gzipLength?: number; brotliLength?: number }>;
    }
  >;
};

function sumModuleTree(node: RawModuleTree, nodeParts: RawBundleFile['nodeParts']): number {
  if (node.uid && nodeParts[node.uid]) {
    return nodeParts[node.uid].renderedLength ?? 0;
  }
  if (!node.children?.length) return 0;
  return node.children.reduce((sum, child) => sum + sumModuleTree(child, nodeParts), 0);
}

function computeVendorBytes(raw: RawBundleFile): number {
  let sum = 0;
  for (const part of Object.values(raw.nodeParts ?? {})) {
    const meta = part.metaUid ? raw.nodeMetas?.[part.metaUid] : undefined;
    const id = meta?.id ?? '';
    if (id.includes('node_modules')) {
      sum += part.renderedLength ?? 0;
    }
  }
  return sum;
}

function pkgFromPath(id: string): string | null {
  const m = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  return m ? m[1] : null;
}

function findDuplicatedPackages(raw: RawBundleFile): string[] {
  const pathsByPackage = new Map<string, Set<string>>();
  for (const meta of Object.values(raw.nodeMetas ?? {})) {
    const pkg = pkgFromPath(meta.id);
    if (!pkg) continue;
    if (!pathsByPackage.has(pkg)) pathsByPackage.set(pkg, new Set());
    pathsByPackage.get(pkg)!.add(meta.id);
  }
  return [...pathsByPackage.entries()]
    .filter(([, paths]) => paths.size > 1)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 40)
    .map(([pkg]) => pkg);
}

export function parseVisualizerRawData(raw: unknown): BundleMetrics {
  const data = raw as RawBundleFile;
  const collectedAt = new Date().toISOString();
  const partSizes = Object.values(data.nodeParts ?? {});
  const totalBytes = partSizes.reduce((s, p) => s + (p.renderedLength ?? 0), 0);
  const gzipBytes =
    partSizes.length > 0 && partSizes.every((p) => typeof p.gzipLength === 'number')
      ? partSizes.reduce((s, p) => s + (p.gzipLength ?? 0), 0)
      : null;

  const roots = data.tree?.children ?? [];
  const largestChunks = roots
    .map((child) => ({ name: child.name, bytes: sumModuleTree(child, data.nodeParts ?? {}) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15);

  return {
    totalBytes,
    gzipBytes,
    largestChunks,
    duplicatedPackages: findDuplicatedPackages(data),
    vendorBytes: computeVendorBytes(data),
    collectedAt,
    source: 'rollup-plugin-visualizer-raw-data'
  };
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/** JS/CSS assets produced by typical Vite/Rollup/SvelteKit builds */
const ASSET_FILE_RE = /\.(js|mjs|cjs|css)$/i;

/** Ordered search for on-disk bundles when visualizer raw-data is missing */
export const BUNDLE_FALLBACK_OUTPUT_DIRS = [
  'dist',
  'build',
  '.svelte-kit/output/client',
  '.svelte-kit/output',
  'out'
] as const;

export function resolveBundleFallbackDirs(projectRoot: string): string[] {
  const abs: string[] = [];
  for (const rel of BUNDLE_FALLBACK_OUTPUT_DIRS) {
    const p = path.join(projectRoot, rel);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) abs.push(path.resolve(p));
  }
  return abs;
}

export interface BundleFallbackDiagnostics {
  scannedRootRels: string[];
  fileCount: number;
  chunkCount: number;
  totalBytes: number;
  vendorBytes: number;
}

/**
 * Sum sizes of JS/CSS assets under known output roots (deduped by normalized path).
 * Vendor vs app split uses `node_modules` in the path (Windows-safe via normalized separators).
 */
export function approximateBundleFromOutputDirs(
  projectRoot: string,
  onDiag?: (msg: string, meta?: Record<string, unknown>) => void
): { metrics: BundleMetrics; diag: BundleFallbackDiagnostics } {
  const rootAbs = path.resolve(projectRoot);
  const dirs = resolveBundleFallbackDirs(projectRoot);
  const scannedRootRels = dirs.map((d) => {
    const rel = path.relative(rootAbs, d);
    return rel && rel !== '' ? rel.split(path.sep).join('/') : '.';
  });

  if (!dirs.length) {
    onDiag?.('bundle-fallback: no output directories found', {
      candidates: [...BUNDLE_FALLBACK_OUTPUT_DIRS]
    });
    return {
      metrics: {
        totalBytes: 0,
        gzipBytes: null,
        largestChunks: [],
        duplicatedPackages: [],
        vendorBytes: 0,
        collectedAt: new Date().toISOString(),
        source: 'output-scan'
      },
      diag: { scannedRootRels: [], fileCount: 0, chunkCount: 0, totalBytes: 0, vendorBytes: 0 }
    };
  }

  const resolvedSizes = new Map<string, number>();
  for (const d of dirs) {
    for (const f of walkFiles(d)) {
      if (!ASSET_FILE_RE.test(f)) continue;
      const norm = path.normalize(f);
      if (resolvedSizes.has(norm)) continue;
      try {
        resolvedSizes.set(norm, fs.statSync(f).size);
      } catch {
        /* ignore */
      }
    }
  }

  let vendor = 0;
  let app = 0;
  for (const [abs, sz] of resolvedSizes) {
    const posix = abs.split(path.sep).join('/');
    if (posix.includes('/node_modules/') || posix.endsWith('/node_modules')) vendor += sz;
    else app += sz;
  }
  const totalBytes = vendor + app;

  const chunks = [...resolvedSizes.entries()]
    .map(([abs, bytes]) => ({
      name: path.relative(rootAbs, abs).split(path.sep).join('/') || abs,
      bytes
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20);

  const onlyDist =
    dirs.length === 1 && path.basename(dirs[0]!) === 'dist';
  const source: BundleMetrics['source'] = onlyDist ? 'dist-scan' : 'output-scan';

  onDiag?.('bundle-fallback: asset scan complete', {
    scannedRootRels,
    fileCount: resolvedSizes.size,
    chunkCount: chunks.length,
    totalBytes,
    vendorBytes: vendor
  });

  return {
    metrics: {
      totalBytes,
      gzipBytes: null,
      largestChunks: chunks,
      duplicatedPackages: [],
      vendorBytes: vendor,
      collectedAt: new Date().toISOString(),
      source
    },
    diag: {
      scannedRootRels,
      fileCount: resolvedSizes.size,
      chunkCount: chunks.length,
      totalBytes,
      vendorBytes: vendor
    }
  };
}

/** @deprecated internal name — prefer approximateBundleFromOutputDirs */
export function approximateBundleFromDist(projectRoot: string): BundleMetrics {
  return approximateBundleFromOutputDirs(projectRoot).metrics;
}

export function resolveStatsCandidates(projectRoot: string, cacheDir: string, statsOutputPath?: string): string[] {
  const list: string[] = [];
  if (statsOutputPath) {
    list.push(path.isAbsolute(statsOutputPath) ? statsOutputPath : path.join(projectRoot, statsOutputPath));
  }
  list.push(path.join(cacheDir, 'bundle-raw.json'));
  list.push(path.join(projectRoot, '.observer', 'cache', 'bundle-raw.json'));
  list.push(path.join(projectRoot, 'observability', '.cache', 'bundle-raw.json'));
  return list;
}

export function tryReadBundleStats(paths: string[]): BundleMetrics | null {
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
      const np = (raw as RawBundleFile).nodeParts;
      if (!np || typeof np !== 'object' || Object.keys(np).length === 0) continue;
      return parseVisualizerRawData(raw);
    } catch {
      /* try next */
    }
  }
  return null;
}
