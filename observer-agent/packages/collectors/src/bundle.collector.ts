import fs from 'node:fs';
import path from 'node:path';
import type { BundleMetrics, CollectorHealth } from '@observer/core';
import type { ObserverConfig } from '@observer/config';
import type { ProjectProfile } from '@observer/core';
import { runProjectProductionBuild } from './build-runner.js';
import {
  approximateBundleFromOutputDirs,
  resolveStatsCandidates,
  tryReadBundleStats
} from './bundle-utils.js';
import type { CollectorRunContext } from './collector-context.js';

export async function collectBundleMetrics(args: {
  projectRoot: string;
  cacheDir: string;
  profile: ProjectProfile;
  config: ObserverConfig;
  ctx: CollectorRunContext;
}): Promise<{ metrics: BundleMetrics; health: CollectorHealth }> {
  const { projectRoot, cacheDir, profile, config, ctx } = args;
  fs.mkdirSync(cacheDir, { recursive: true });

  runProjectProductionBuild({ projectRoot, profile, config });

  const candidates = resolveStatsCandidates(projectRoot, cacheDir, config.build?.statsOutputPath);
  ctx.logVerbose('bundle: rollup visualizer candidate paths', { paths: candidates });

  const fromStats = tryReadBundleStats(candidates);
  if (fromStats) {
    const hit = candidates.find((p) => fs.existsSync(p));
    const rawPaths: string[] = [];
    if (hit) {
      try {
        rawPaths.push(ctx.writeRaw('bundle-visualizer-raw.json', fs.readFileSync(hit, 'utf8')));
      } catch {
        /* non-fatal */
      }
    }
    const health: CollectorHealth =
      fromStats.totalBytes > 0
        ? { status: 'success', detail: 'rollup-plugin-visualizer raw-data', rawPaths: rawPaths.length ? rawPaths : undefined }
        : {
            status: 'partial',
            detail: 'Visualizer JSON had no measurable nodeParts (total 0 B)',
            rawPaths: rawPaths.length ? rawPaths : undefined
          };
    ctx.logDebug('bundle: parsed visualizer raw-data', {
      totalBytes: fromStats.totalBytes,
      vendorBytes: fromStats.vendorBytes,
      chunkRoots: fromStats.largestChunks.length
    });
    return { metrics: fromStats, health };
  }

  console.warn('[observer] No rollup visualizer raw-data found; using multi-root asset scan fallback.');
  const rawPaths: string[] = [];
  const { metrics, diag } = approximateBundleFromOutputDirs(projectRoot, (msg, meta) => ctx.logDebug(msg, meta));
  try {
    rawPaths.push(
      ctx.writeRaw(
        'bundle-fallback-diagnostics.json',
        JSON.stringify({ ...diag, statsCandidatesTried: candidates }, null, 2)
      )
    );
  } catch {
    /* ignore */
  }

  const health: CollectorHealth =
    metrics.totalBytes === 0
      ? {
          status: 'partial',
          detail:
            'No visualizer raw-data and no JS/CSS assets found under dist/, build/, .svelte-kit/output, out/. Add rollup-plugin-visualizer (raw-data) to the target Vite config when OBSERVER_BUNDLE=1.',
          rawPaths: rawPaths.length ? rawPaths : undefined
        }
      : {
          status: 'partial',
          detail: 'No visualizer raw-data; totals from on-disk JS/CSS scan (less accurate than Rollup stats)',
          rawPaths: rawPaths.length ? rawPaths : undefined
        };

  ctx.logVerbose('bundle: fallback scan summary', {
    scannedRootRels: diag.scannedRootRels,
    fileCount: diag.fileCount,
    totalBytes: diag.totalBytes
  });

  return { metrics, health };
}
