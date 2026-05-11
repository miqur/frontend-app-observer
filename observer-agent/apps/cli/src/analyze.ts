import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import {
  detectProject,
  resolveUserPath,
  slugifyProjectPath,
  getObserverDataDir,
  projectCacheDir,
  projectReportsDir,
  ensureDir,
  defaultDatabasePath,
  defaultSessionLogPath
} from '@observer/core';
import { loadObserverConfig } from '@observer/config';
import { readGitMeta } from '@observer/git';
import {
  collectBundleMetrics,
  collectLighthouseMetrics,
  collectKnipMetrics,
  collectDependencyMetrics,
  runProjectProductionBuild,
  createCollectorRunContext
} from '@observer/collectors';
import {
  buildHistoryComparison,
  computeTrendSnapshot,
  buildTrendFindings,
  evaluateBudgets,
  computeHealthScorecard
} from '@observer/analyzers';
import {
  openDatabase,
  upsertProject,
  insertSnapshot,
  getSnapshotsForProject,
  countSnapshots,
  insertRegressionEvents,
  upsertTrendSample
} from '@observer/storage';
import {
  detectRegressions,
  buildRegressionHistory,
  buildTerminalReport,
  buildMarkdownReport,
  exitCodeFromIssues,
  toReportIssues
} from '@observer/reports';
import type { ObserverReportContext } from '@observer/reports';
import { createLogger } from '@observer/logger';
import { isCollectorEnabled } from '@observer/shared';
import type {
  BundleMetrics,
  DependencyMetrics,
  KnipMetrics,
  LighthouseMetrics,
  SnapshotCollectorHealth
} from '@observer/core';

function timestampForFilename(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

export interface AnalyzeCliOptions {
  verbose?: boolean;
  quiet?: boolean;
  /** Implies verbose logger output for collector diagnostics */
  debug?: boolean;
}

export async function runAnalyze(projectArg: string, cliOpts: AnalyzeCliOptions = {}): Promise<number> {
  const verbose = Boolean(cliOpts.verbose || process.env.OBSERVER_VERBOSE === '1');
  const quiet = Boolean(cliOpts.quiet || process.env.OBSERVER_QUIET === '1');
  const debug = Boolean(cliOpts.debug || process.env.OBSERVER_DEBUG === '1');
  const logFile = process.env.OBSERVER_LOG_FILE === '0' ? null : defaultSessionLogPath();
  const logger = createLogger({ verbose: verbose || debug, quiet, logFilePath: logFile });

  const projectRoot = resolveUserPath(projectArg);
  if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
    logger.error(`Not a Node project (missing package.json): ${projectRoot}`);
    return 1;
  }

  const profile = detectProject(projectRoot);
  const config = await loadObserverConfig(projectRoot);

  const disabled = config.disabledCollectors ?? [];
  const runBundle = isCollectorEnabled(disabled, 'bundle');
  const runLh = isCollectorEnabled(disabled, 'lighthouse');
  const runKnip = isCollectorEnabled(disabled, 'knip');
  const runDep = isCollectorEnabled(disabled, 'dependency');

  const active = [runBundle, runLh, runKnip, runDep].filter(Boolean).length;
  if (active === 0) {
    logger.error('All collectors are disabled in observer.config — nothing to run.');
    return 2;
  }

  const dbPath = defaultDatabasePath();
  const db = openDatabase(dbPath);
  const slug = slugifyProjectPath(projectRoot);
  const projectId = upsertProject(db, profile, slug);
  const cacheDir = projectCacheDir(projectId);
  ensureDir(cacheDir);

  const ctx = createCollectorRunContext({
    projectRoot,
    projectId,
    debug,
    verbose,
    logDebug: (msg, meta) => logger.debug(msg, meta),
    logVerbose: (msg, meta) => logger.debug(msg, meta)
  });

  if (debug) {
    logger.debug('Raw collector outputs directory', { rawSessionDir: ctx.rawSessionDir });
    logger.debug('Resolved project root', { projectRoot });
  }

  let step = 0;

  logger.info(`Project: ${profile.name}`);
  logger.info(`Root: ${projectRoot}`);
  logger.debug(`Data dir: ${getObserverDataDir()}`);
  logger.info(
    `Detected: ${profile.packageManager}, ${profile.framework}, vite=${profile.hasVite}, ts=${profile.hasTypeScript}`
  );
  logger.info(`Build: ${config.build?.command ?? profile.defaultAnalyzeBuildCommand}`);
  logger.info(`Database: ${dbPath}`);
  if (disabled.length) {
    logger.warn(`Disabled collectors: ${disabled.join(', ')}`);
  }

  let bundle: BundleMetrics | null = null;
  let lighthouse: LighthouseMetrics | null = null;
  let knip: KnipMetrics | null = null;
  let dependency: DependencyMetrics | null = null;
  const collectorHealth: SnapshotCollectorHealth = {};

  const spin = (text: string) =>
    ora({ text, color: 'cyan', isSilent: quiet || !process.stdout.isTTY }).start();

  if (runBundle) {
    step += 1;
    logger.step(step, active || 1, 'Bundle (build + stats)');
    const s = spin('Production build and bundle metrics…');
    try {
      const r = await collectBundleMetrics({ projectRoot, cacheDir, profile, config, ctx });
      bundle = r.metrics;
      collectorHealth.bundle = r.health;
      s.succeed('Bundle metrics collected');
    } catch (e) {
      s.fail('Bundle step failed');
      collectorHealth.bundle = {
        status: 'failed',
        detail: e instanceof Error ? e.message : String(e)
      };
      logger.error('Bundle collector failed', { error: String(e) });
    }
  } else if (runLh) {
    step += 1;
    logger.step(step, active || 1, 'Production build (bundle collector disabled)');
    const s = spin('Running production build for Lighthouse…');
    try {
      runProjectProductionBuild({ projectRoot, profile, config });
      s.succeed('Build finished');
    } catch (e) {
      s.fail('Build failed');
      collectorHealth.bundle = collectorHealth.bundle ?? {
        status: 'failed',
        detail: `Build only (no bundle collector): ${e instanceof Error ? e.message : String(e)}`
      };
      logger.error('Build failed', { error: String(e) });
    }
  }

  if (runLh) {
    step += 1;
    logger.step(step, active || 1, 'Lighthouse (static dist)');
    const s = spin('Lighthouse CI collect…');
    try {
      const r = await collectLighthouseMetrics(projectRoot, cacheDir, config.lighthouse, ctx);
      lighthouse = r.metrics;
      collectorHealth.lighthouse = r.health;
      s.succeed(
        r.health.status === 'success' ? 'Lighthouse complete' : 'Lighthouse finished (partial / no scores)'
      );
    } catch (e) {
      s.fail('Lighthouse failed');
      collectorHealth.lighthouse = {
        status: 'failed',
        detail: e instanceof Error ? e.message : String(e)
      };
      logger.error('Lighthouse collector failed', { error: String(e) });
    }
  }

  if (runKnip) {
    step += 1;
    logger.step(step, active || 1, 'Knip');
    const s = spin('Knip unused-code scan…');
    try {
      const r = await collectKnipMetrics(projectRoot, ctx);
      knip = r.metrics;
      collectorHealth.knip = r.health;
      s.succeed(r.health.status === 'failed' ? 'Knip finished with errors' : 'Knip complete');
    } catch (e) {
      s.fail('Knip failed');
      collectorHealth.knip = { status: 'failed', detail: e instanceof Error ? e.message : String(e) };
      logger.error('Knip collector failed', { error: String(e) });
    }
  }

  if (runDep) {
    step += 1;
    logger.step(step, active || 1, 'dependency-cruiser');
    const s = spin('Dependency graph…');
    try {
      const r = await collectDependencyMetrics({ projectRoot, profile, config, ctx });
      dependency = r.metrics;
      collectorHealth.dependency = r.health;
      s.succeed(r.metrics ? 'dependency-cruiser complete' : 'dependency-cruiser finished with errors');
    } catch (e) {
      s.fail('dependency-cruiser failed');
      collectorHealth.dependency = { status: 'failed', detail: e instanceof Error ? e.message : String(e) };
      logger.error('dependency-cruiser failed', { error: String(e) });
    }
  }

  const { commitHash, branch } = readGitMeta(projectRoot);
  const insertedId = insertSnapshot(db, projectId, {
    commitHash,
    branch,
    bundle,
    lighthouse,
    knip,
    dependency,
    collectorHealth: Object.keys(collectorHealth).length ? collectorHealth : null
  });

  const window = Math.max(config.trends.windowRuns, 15, 12);
  const historyWindow = getSnapshotsForProject(db, projectId, window);
  const current = historyWindow[0];
  const previous = historyWindow[1] ?? null;

  if (!current || current.id !== insertedId) {
    throw new Error('Failed to read latest snapshot after insert');
  }

  const history = buildHistoryComparison(historyWindow, config.trends.windowRuns);
  const trends = computeTrendSnapshot(historyWindow, config);
  const regressionsPair = detectRegressions(previous, current, config);
  const trendFindings = buildTrendFindings(trends, config);
  const regressionsAll = [...regressionsPair, ...trendFindings];
  const budgetViolations = evaluateBudgets(current, config);
  const issues = toReportIssues({ regressions: regressionsAll, budgetViolations, config });
  const scorecard = computeHealthScorecard({ current, trends, config });
  const regressionHistory = buildRegressionHistory(historyWindow, config, 12);

  insertRegressionEvents(db, {
    projectId,
    snapshotFromId: previous?.id ?? null,
    snapshotToId: insertedId,
    issues: issues.map((i) => ({
      severity: i.severity,
      kind: i.kind,
      message: i.message,
      recommendation: i.recommendation,
      source: i.source
    }))
  });

  upsertTrendSample(db, projectId, insertedId, current);

  const reportCtx: ObserverReportContext = {
    projectPath: projectRoot,
    projectName: profile.name,
    current,
    history,
    trends,
    scorecard,
    issues,
    regressions: regressionsAll,
    regressionHistory
  };

  const terminal = buildTerminalReport(reportCtx);
  const generatedAt = new Date().toISOString();
  const markdown = buildMarkdownReport(reportCtx, generatedAt);

  const reportsDir = projectReportsDir(slug);
  ensureDir(reportsDir);
  const mdName = `observer-${timestampForFilename(generatedAt)}.md`;
  const mdPath = path.join(reportsDir, mdName);
  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(path.join(reportsDir, 'last.txt'), terminal, 'utf8');

  const exitCode = exitCodeFromIssues(issues);

  if (!quiet) {
    console.log('\n--- Report ---\n');
    console.log(`Snapshots for this project: ${countSnapshots(db, projectId)}`);
    console.log(terminal);
    console.log(`\nMarkdown: ${mdPath}`);
    if (debug || Object.keys(collectorHealth).length) {
      console.log(`\nRaw outputs: ${ctx.rawSessionDir}`);
    }
    console.log(`CI exit code: ${exitCode} (0 ok, 1 warnings, 2 critical)`);
  } else {
    logger.info(`Markdown report: ${mdPath}`);
    logger.info(`CI exit code: ${exitCode}`);
  }

  db.close();
  return exitCode;
}
