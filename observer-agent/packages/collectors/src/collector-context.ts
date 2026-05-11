import fs from 'node:fs';
import path from 'node:path';
import { rawCollectorSessionDir } from '@observer/core';

export type CollectorLogFn = (msg: string, meta?: Record<string, unknown>) => void;

/**
 * Shared per-analyze context: debug flags, raw artifact dir, structured logging.
 */
export interface CollectorRunContext {
  projectRoot: string;
  projectId: number;
  /** ~/.observer-agent/cache/raw/<projectId>/<iso>/ */
  rawSessionDir: string;
  debug: boolean;
  verbose: boolean;
  logDebug: CollectorLogFn;
  logVerbose: CollectorLogFn;
  /** Persist UTF-8 or binary under raw session; returns absolute path */
  writeRaw: (filename: string, body: string | Buffer) => string;
}

export function createCollectorRunContext(args: {
  projectRoot: string;
  projectId: number;
  debug: boolean;
  verbose: boolean;
  logDebug: CollectorLogFn;
  logVerbose: CollectorLogFn;
}): CollectorRunContext {
  const rawSessionDir = rawCollectorSessionDir(args.projectId);
  fs.mkdirSync(rawSessionDir, { recursive: true });

  const writeRaw = (filename: string, body: string | Buffer): string => {
    const safe = filename.replace(/[/\\?%*:|"<>]/g, '_');
    const abs = path.join(rawSessionDir, safe);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (typeof body === 'string') fs.writeFileSync(abs, body, 'utf8');
    else fs.writeFileSync(abs, body);
    return abs;
  };

  return {
    projectRoot: args.projectRoot,
    projectId: args.projectId,
    rawSessionDir,
    debug: args.debug,
    verbose: args.verbose,
    logDebug: args.logDebug,
    logVerbose: args.logVerbose,
    writeRaw
  };
}
