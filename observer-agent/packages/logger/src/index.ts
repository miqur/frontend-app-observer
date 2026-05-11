import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  /** Append JSON lines (one object per line) for auditing */
  logFilePath?: string | null;
}

function shouldPrint(level: LogLevel, opts: LoggerOptions): boolean {
  if (opts.quiet && level !== 'error') return false;
  if (level === 'debug' && !opts.verbose) return false;
  return true;
}

function appendFileLine(filePath: string | null | undefined, line: object): void {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(line) + '\n', 'utf8');
  } catch {
    /* avoid crashing CLI on log IO errors */
  }
}

export function createLogger(opts: LoggerOptions = {}) {
  const stamp = () => new Date().toISOString();

  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    appendFileLine(opts.logFilePath, { t: stamp(), level, msg, ...meta });
    if (!shouldPrint(level, opts)) return;
    const prefix =
      level === 'error'
        ? chalk.red.bold('error')
        : level === 'warn'
          ? chalk.yellow.bold('warn')
          : level === 'debug'
            ? chalk.gray('debug')
            : chalk.blue('info');
    const line = `${chalk.dim(stamp())} ${prefix} ${msg}`;
    if (level === 'error') console.error(line);
    else console.log(line);
  };

  return {
    debug(msg: string, meta?: Record<string, unknown>) {
      write('debug', msg, meta);
    },
    info(msg: string, meta?: Record<string, unknown>) {
      write('info', msg, meta);
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      write('warn', msg, meta);
    },
    error(msg: string, meta?: Record<string, unknown>) {
      write('error', msg, meta);
    },
    /** Always visible unless quiet (then still hidden except errors). */
    success(msg: string) {
      appendFileLine(opts.logFilePath, { t: stamp(), level: 'info', msg, kind: 'success' });
      if (opts.quiet) return;
      console.log(chalk.green('✔') + ' ' + msg);
    },
    /** Progress step label (no chalk noise in quiet). */
    step(current: number, total: number, label: string) {
      appendFileLine(opts.logFilePath, { t: stamp(), level: 'info', step: `${current}/${total}`, label });
      if (opts.quiet) return;
      console.log(chalk.cyan(`[${current}/${total}]`) + ' ' + chalk.bold(label));
    }
  };
}

export type Logger = ReturnType<typeof createLogger>;
