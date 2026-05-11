#!/usr/bin/env node
import { Command } from 'commander';
import { runAnalyze } from './analyze.js';
import { runHistory } from './history.js';
import { runLatest } from './latest.js';
import { runRegressions } from './regressions.js';

/**
 * Global flags can appear before or after the subcommand.
 * `OBSERVER_VERBOSE` / `OBSERVER_QUIET` env vars are also honored.
 */
for (const a of process.argv) {
  if (a === '-v' || a === '--verbose') process.env.OBSERVER_VERBOSE = '1';
  if (a === '-q' || a === '--quiet') process.env.OBSERVER_QUIET = '1';
  if (a === '--debug') process.env.OBSERVER_DEBUG = '1';
}

const program = new Command();
program
  .name('observer')
  .description('Local-first multi-project frontend engineering observability CLI')
  .version('0.2.0')
  .option('-v, --verbose', 'Verbose logging (any position on the command line)')
  .option('-q, --quiet', 'Minimal terminal output');

program
  .command('help')
  .description('Show help for all commands')
  .action(() => {
    program.outputHelp();
  });

program
  .command('analyze')
  .description('Run collectors + analyzers against a repository and store a snapshot')
  .argument('<path>', 'Absolute, relative, or ~/ path to the project root')
  .option('--debug', 'Print collector diagnostics, resolved paths, and raw artifact locations')
  .action(async (p: string, opts: { debug?: boolean }) => {
    if (opts.debug) process.env.OBSERVER_DEBUG = '1';
    const code = await runAnalyze(p, {
      verbose: process.env.OBSERVER_VERBOSE === '1',
      quiet: process.env.OBSERVER_QUIET === '1',
      debug: Boolean(opts.debug || process.env.OBSERVER_DEBUG === '1')
    });
    process.exit(code);
  });

program
  .command('history')
  .description('List recent snapshots for a project (id, slug, name, or path substring)')
  .argument('<project>', 'Project key')
  .action((project: string) => {
    runHistory(project);
  });

program
  .command('latest')
  .description('Print latest snapshot JSON for a project')
  .argument('<project>', 'Project key')
  .action((project: string) => {
    runLatest(project);
  });

program
  .command('regressions')
  .description('Pairwise regressions from snapshots and persisted regression events')
  .argument('<project>', 'Project key')
  .action(async (project: string) => {
    await runRegressions(project);
  });

program.showHelpAfterError('(run observer help for usage)');

program.parse();
