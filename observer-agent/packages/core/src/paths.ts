import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Central Observer data directory (override with `OBSERVER_DATA_DIR`). */
export function getObserverDataDir(): string {
  const fromEnv = process.env.OBSERVER_DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), '.observer-agent');
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Ensures the canonical on-disk layout:
 *   data/   — SQLite and future local artifacts
 *   reports/
 *   cache/
 *   logs/
 */
export function ensureObserverLayout(): void {
  const root = getObserverDataDir();
  ensureDir(path.join(root, 'data'));
  ensureDir(path.join(root, 'reports'));
  ensureDir(path.join(root, 'cache'));
  ensureDir(path.join(root, 'cache', 'raw'));
  ensureDir(path.join(root, 'logs'));
}

/**
 * Per-analyze session directory for raw collector outputs (LHCI JSON, knip stdout, depcruise, bundle stats copy).
 * Example: ~/.observer-agent/cache/raw/<projectId>/2026-05-11T12-00-00-000Z/
 */
export function rawCollectorSessionDir(projectId: number, runIso = new Date().toISOString()): string {
  const safe = runIso.replace(/[:.]/g, '-');
  return path.join(getObserverDataDir(), 'cache', 'raw', String(projectId), safe);
}

/** Primary SQLite database (multi-project). */
export function defaultDatabasePath(): string {
  return path.join(getObserverDataDir(), 'data', 'metrics.db');
}

/** Legacy single-file DB at repo root (pre–layout migration). */
export function legacyDatabasePath(): string {
  return path.join(getObserverDataDir(), 'observer.db');
}

/**
 * If `data/metrics.db` is missing but `observer.db` exists from an older CLI,
 * copy the legacy file into the new location (read-only on legacy).
 */
export function migrateLegacyDatabaseIfNeeded(): void {
  const next = defaultDatabasePath();
  const legacy = legacyDatabasePath();
  try {
    if (!fs.existsSync(next) && fs.existsSync(legacy)) {
      ensureDir(path.dirname(next));
      fs.copyFileSync(legacy, next);
    }
  } catch {
    /* non-fatal */
  }
}

export function projectCacheDir(projectId: number): string {
  return path.join(getObserverDataDir(), 'cache', String(projectId));
}

export function projectReportsDir(slug: string): string {
  return path.join(getObserverDataDir(), 'reports', slug);
}

/** Daily session log under logs/ (JSON lines). */
export function defaultSessionLogPath(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(getObserverDataDir(), 'logs', `observer-${day}.log`);
}

/** Slug for filesystem-safe directory names. */
export function slugifyProjectPath(projectPath: string): string {
  const base = path.basename(projectPath);
  const h = simpleHash(projectPath);
  return `${sanitize(base)}-${h}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48) || 'project';
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1_000_000).toString(36);
}

/** Resolve CLI path argument (supports `~/project`). */
export function resolveUserPath(input: string): string {
  let s = input.trim();
  if (s.startsWith('~/')) {
    s = path.join(os.homedir(), s.slice(2));
  } else if (s === '~') {
    s = os.homedir();
  }
  return path.resolve(s);
}
