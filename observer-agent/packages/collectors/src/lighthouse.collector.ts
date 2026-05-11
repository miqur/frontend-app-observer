import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CollectorHealth, LighthouseMetrics } from '@observer/core';
import type { ObserverConfig } from '@observer/config';
import type { CollectorRunContext } from './collector-context.js';

const STATIC_DIST_CANDIDATES = [
  'dist',
  'build',
  '.svelte-kit/output/client',
  '.svelte-kit/output'
] as const;

const LH_MAX_ATTEMPTS = 3;
const LH_RETRY_MS = 3000;

function isDir(p: string): boolean {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

/** Absolute path to static root for LHCI; honors `lighthouse.staticDistDir` then common framework outputs. */
export function resolveLighthouseStaticRoot(
  projectRoot: string,
  lighthouse?: ObserverConfig['lighthouse']
): string {
  const override = lighthouse?.staticDistDir?.trim();
  if (override) {
    const abs = path.resolve(projectRoot, override);
    if (isDir(abs)) return abs;
    throw new Error(
      `lighthouse.staticDistDir not found or not a directory: ${override} (resolved: ${abs})`
    );
  }
  for (const rel of STATIC_DIST_CANDIDATES) {
    const abs = path.join(projectRoot, rel);
    if (isDir(abs)) return abs;
  }
  throw new Error(
    'No static site output for Lighthouse. Tried: dist/, build/, .svelte-kit/output/client/, .svelte-kit/output/. ' +
      'Run a production build first, or set lighthouse.staticDistDir in observer.config to your static output folder.'
  );
}

/** Path for LHCI `staticDistDir` (relative to project root, POSIX-style `./…`). */
function toLhciRelativeStaticDist(projectRoot: string, staticRootAbs: string): string {
  const rel = path.relative(path.resolve(projectRoot), path.resolve(staticRootAbs));
  if (!rel || rel === '.') return '.';
  const posix = rel.split(path.sep).join('/');
  return posix.startsWith('.') ? posix : `./${posix}`;
}

type LhrLike = {
  categories?: Record<string, { score: number | null }>;
  audits?: Record<string, { numericValue?: number; score?: number | null }>;
  finalUrl?: string;
};

function scoreTo100(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

function readLatestLhr(projectRoot: string): { lhr: LhrLike | null; sourceFile: string | null } {
  const dir = path.join(projectRoot, '.lighthouseci');
  if (!fs.existsSync(dir)) return { lhr: null, sourceFile: null };
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const { f } of files) {
    const p = path.join(dir, f);
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8')) as LhrLike;
      if (j?.categories && typeof j.categories === 'object') return { lhr: j, sourceFile: p };
    } catch {
      /* ignore */
    }
  }
  return { lhr: null, sourceFile: null };
}

function snapshotLighthouseCiDir(projectRoot: string, ctx: CollectorRunContext): string | null {
  const src = path.join(projectRoot, '.lighthouseci');
  if (!fs.existsSync(src)) return null;
  try {
    const destName = 'lighthouseci-output';
    const dest = path.join(ctx.rawSessionDir, destName);
    fs.cpSync(src, dest, { recursive: true });
    return dest;
  } catch {
    return null;
  }
}

function lhrToMetrics(lhr: LhrLike | null, collectedAt: string): LighthouseMetrics {
  if (!lhr?.categories) {
    return {
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
      lcpMs: null,
      cls: null,
      tbtMs: null,
      collectedAt,
      runUrl: lhr?.finalUrl
    };
  }
  const audits = lhr.audits ?? {};
  return {
    performance: scoreTo100(lhr.categories.performance?.score ?? null),
    accessibility: scoreTo100(lhr.categories.accessibility?.score ?? null),
    bestPractices: scoreTo100(lhr.categories['best-practices']?.score ?? null),
    seo: scoreTo100(lhr.categories.seo?.score ?? null),
    lcpMs: typeof audits['largest-contentful-paint']?.numericValue === 'number'
      ? audits['largest-contentful-paint'].numericValue
      : null,
    cls: typeof audits['cumulative-layout-shift']?.numericValue === 'number'
      ? audits['cumulative-layout-shift'].numericValue
      : null,
    tbtMs: typeof audits['total-blocking-time']?.numericValue === 'number'
      ? audits['total-blocking-time'].numericValue
      : null,
    collectedAt,
    runUrl: lhr.finalUrl
  };
}

export async function collectLighthouseMetrics(
  projectRoot: string,
  cacheDir: string,
  lighthouse: ObserverConfig['lighthouse'] | undefined,
  ctx: CollectorRunContext
): Promise<{ metrics: LighthouseMetrics; health: CollectorHealth }> {
  const staticRootAbs = resolveLighthouseStaticRoot(projectRoot, lighthouse);
  const staticDistDir = toLhciRelativeStaticDist(projectRoot, staticRootAbs);

  fs.mkdirSync(cacheDir, { recursive: true });
  const rcPath = path.join(cacheDir, 'lighthouserc.json');
  const rc = {
    ci: {
      collect: {
        staticDistDir,
        numberOfRuns: 1,
        settings: { preset: 'desktop', skipAudits: ['uses-http2'] }
      }
    }
  };
  fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), 'utf8');

  const rawPaths: string[] = [];
  try {
    rawPaths.push(ctx.writeRaw('lighthouserc.resolved.json', JSON.stringify({ ...rc, _resolved: { staticRootAbs, staticDistDir, projectRoot } }, null, 2)));
  } catch {
    /* ignore */
  }

  const npxCmd = `npx --yes lhci collect --config ${JSON.stringify(rcPath)}`;
  ctx.logVerbose('lighthouse: static dist for LHCI', {
    staticRootAbs,
    staticDistDir,
    cwd: projectRoot
  });
  ctx.logDebug('lighthouse: LHCI command (shell)', { command: npxCmd });

  const lhDir = path.join(projectRoot, '.lighthouseci');
  if (fs.existsSync(lhDir)) {
    try {
      fs.rmSync(lhDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  let lastStatus: number | null = null;
  let lastStderr = '';

  for (let attempt = 1; attempt <= LH_MAX_ATTEMPTS; attempt++) {
    ctx.logDebug(`lighthouse: LHCI collect attempt ${attempt}/${LH_MAX_ATTEMPTS}`, { rcPath });

    const result = spawnSync('npx', ['--yes', 'lhci', 'collect', '--config', rcPath], {
      cwd: projectRoot,
      shell: true,
      encoding: 'utf-8',
      maxBuffer: 25 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    lastStatus = result.status ?? null;
    lastStderr = (result.stderr ?? '').trim();
    const out = (result.stdout ?? '').trim();

    try {
      rawPaths.push(ctx.writeRaw(`lhci-attempt-${attempt}-stdout.txt`, out.slice(0, 8_000_000)));
      rawPaths.push(ctx.writeRaw(`lhci-attempt-${attempt}-stderr.txt`, lastStderr.slice(0, 8_000_000)));
    } catch {
      /* ignore */
    }

    if (ctx.debug || ctx.verbose) {
      if (out) console.log(out);
      if (lastStderr) console.error(lastStderr);
    }

    const { lhr, sourceFile } = readLatestLhr(projectRoot);
    if (lhr?.categories && sourceFile) {
      try {
        rawPaths.push(ctx.writeRaw('lighthouse-lhr-used.json', fs.readFileSync(sourceFile, 'utf8')));
      } catch {
        /* ignore */
      }
      const snap = snapshotLighthouseCiDir(projectRoot, ctx);
      if (snap) rawPaths.push(snap);

      const collectedAt = new Date().toISOString();
      const metrics = lhrToMetrics(lhr, collectedAt);
      const health: CollectorHealth = {
        status: 'success',
        detail: `LHCI exit ${lastStatus}, categories present`,
        rawPaths: rawPaths.length ? [...new Set(rawPaths)] : undefined
      };
      return { metrics, health };
    }

    ctx.logVerbose(`lighthouse: no valid LHR after attempt ${attempt} (exit ${lastStatus})`, {
      stderrPreview: lastStderr.slice(0, 800)
    });

    if (attempt < LH_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, LH_RETRY_MS));
    }
  }

  const snap = snapshotLighthouseCiDir(projectRoot, ctx);
  if (snap) rawPaths.push(snap);

  const collectedAt = new Date().toISOString();
  const { lhr } = readLatestLhr(projectRoot);
  const metrics = lhrToMetrics(lhr, collectedAt);

  try {
    rawPaths.push(
      ctx.writeRaw('lighthouse-summary.json', JSON.stringify({ lastStatus, staticDistDir, staticRootAbs }, null, 2))
    );
  } catch {
    /* ignore */
  }

  const health: CollectorHealth = {
    status: 'partial',
    detail: `LHCI finished (last exit ${lastStatus}) but no Lighthouse JSON with categories under .lighthouseci. ${lastStderr ? `Stderr (truncated): ${lastStderr.slice(0, 400)}` : 'Static root may have no browsable HTML for LHCI.'}`,
    rawPaths: rawPaths.length ? [...new Set(rawPaths)] : undefined
  };

  return { metrics, health };
}
