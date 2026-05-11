import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

function getObserverDataDir(): string {
  const fromEnv = process.env.OBSERVER_DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), '.observer-agent');
}

function dbFilePath(): string {
  return path.join(getObserverDataDir(), 'data', 'metrics.db');
}

let sqlFactory: SqlJsStatic | undefined;

async function ensureSql(): Promise<SqlJsStatic> {
  if (sqlFactory) return sqlFactory;
  const wasmDir = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist');
  sqlFactory = await initSqlJs({
    locateFile: (file: string) => path.join(wasmDir, file)
  });
  return sqlFactory;
}

function openReadonlyDb(dbPath: string): Database {
  if (!sqlFactory) throw new Error('sql.js not initialized');
  const buf = fs.readFileSync(dbPath);
  return new sqlFactory.Database(buf);
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function runOne(db: Database, sql: string, params?: import('sql.js').SqlValue[]): Record<string, unknown> | null {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(params);
    if (!stmt.step()) return null;
    return stmt.getAsObject() as Record<string, unknown>;
  } finally {
    stmt.free();
  }
}

function runAll(db: Database, sql: string, params?: import('sql.js').SqlValue[]): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as Record<string, unknown>);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function runExec(db: Database, sql: string, params?: import('sql.js').SqlValue[]): void {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
}

function persistDbFile(db: Database, dbPath: string): void {
  const data = db.export();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function tryDbCounts(dbPath: string): { projectCount: number; snapshotCount: number; dbError?: string } {
  if (!fs.existsSync(dbPath)) return { projectCount: 0, snapshotCount: 0 };
  if (!sqlFactory) {
    return { projectCount: 0, snapshotCount: 0, dbError: 'sql.js not ready' };
  }
  let db: Database;
  try {
    db = openReadonlyDb(dbPath);
  } catch (e) {
    return {
      projectCount: 0,
      snapshotCount: 0,
      dbError: e instanceof Error ? e.message : String(e)
    };
  }
  try {
    const pc = runOne(db, 'SELECT COUNT(*) AS c FROM projects');
    const sc = runOne(db, 'SELECT COUNT(*) AS c FROM snapshots');
    return {
      projectCount: Number(pc?.c ?? pc?.C ?? 0),
      snapshotCount: Number(sc?.c ?? sc?.C ?? 0)
    };
  } catch (e) {
    return {
      projectCount: 0,
      snapshotCount: 0,
      dbError: e instanceof Error ? e.message : String(e)
    };
  } finally {
    db.close();
  }
}

function mapProjectRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id ?? r.ID),
    path: String(r.path ?? r.PATH ?? ''),
    slug: String(r.slug ?? r.SLUG ?? ''),
    name: String(r.name ?? r.NAME ?? ''),
    packageManager: (r.packageManager ?? r.packagemanager ?? null) as string | null,
    framework: (r.framework ?? r.FRAMEWORK ?? null) as string | null,
    hasVite: Number(r.hasVite ?? r.hasvite ?? 0),
    hasTypeScript: Number(r.hasTypeScript ?? r.hastypescript ?? 0),
    buildCommand: (r.buildCommand ?? r.buildcommand ?? null) as string | null,
    updatedAt: String(r.updatedAt ?? r.updatedat ?? '')
  };
}

function setupApi(middlewares: Connect.Server): void {
  middlewares.use((req: Connect.IncomingMessage, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    if (!pathname.startsWith('/api')) {
      next();
      return;
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      const dbPath = dbFilePath();
      const counts = tryDbCounts(dbPath);
      sendJson(res, 200, {
        dataDir: getObserverDataDir(),
        dbPath,
        exists: fs.existsSync(dbPath),
        homedir: os.homedir(),
        envObserverDataDir: process.env.OBSERVER_DATA_DIR ?? null,
        projectCount: counts.projectCount,
        snapshotCount: counts.snapshotCount,
        dbError: counts.dbError,
        sqliteEngine: 'sql.js'
      });
      return;
    }

    const projectDeleteRe = /^\/api\/projects\/(\d+)$/;
    const projectDeleteMatch = pathname.match(projectDeleteRe);
    if (req.method === 'DELETE' && projectDeleteMatch) {
      const projectId = Number(projectDeleteMatch[1]);
      if (!Number.isFinite(projectId)) {
        next();
        return;
      }
      const dbPath = dbFilePath();
      if (!fs.existsSync(dbPath)) {
        sendJson(res, 404, { error: 'Database file not found' });
        return;
      }
      if (!sqlFactory) {
        sendJson(res, 503, { error: 'Database engine not ready' });
        return;
      }
      const buf = fs.readFileSync(dbPath);
      const db = new sqlFactory.Database(buf);
      try {
        db.run('PRAGMA foreign_keys = ON');
        const row = runOne(db, 'SELECT id, name FROM projects WHERE id = ?', [projectId]);
        if (!row) {
          sendJson(res, 404, { error: 'Project not found' });
          return;
        }
        const name = String(row.name ?? row.NAME ?? '');
        runExec(db, 'DELETE FROM projects WHERE id = ?', [projectId]);
        persistDbFile(db, dbPath);
        sendJson(res, 200, { ok: true, deletedId: projectId, name });
      } catch (e) {
        sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
      } finally {
        db.close();
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/projects') {
      const dbPath = dbFilePath();
      if (!fs.existsSync(dbPath)) {
        sendJson(res, 200, { projects: [] });
        return;
      }
      if (!sqlFactory) {
        sendJson(res, 503, { error: 'Database engine not ready; retry in a moment.' });
        return;
      }
      let db: Database;
      try {
        db = openReadonlyDb(dbPath);
      } catch (e) {
        sendJson(res, 500, { error: `Cannot open database: ${e instanceof Error ? e.message : String(e)}` });
        return;
      }
      try {
        const rows = runAll(
          db,
          `SELECT id, path, slug, name, package_manager AS packageManager, framework,
                  has_vite AS hasVite, has_typescript AS hasTypeScript, build_command AS buildCommand,
                  datetime(updated_at) AS updatedAt
           FROM projects ORDER BY datetime(updated_at) DESC`
        );
        sendJson(res, 200, { projects: rows.map(mapProjectRow) });
      } finally {
        db.close();
      }
      return;
    }

    const snapsRe = /^\/api\/projects\/(\d+)\/snapshots$/;
    const snapMatch = pathname.match(snapsRe);
    if (req.method === 'GET' && snapMatch) {
      const projectId = Number(snapMatch[1]);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '40')));
      const dbPath = dbFilePath();
      if (!fs.existsSync(dbPath)) {
        sendJson(res, 200, { snapshots: [] });
        return;
      }
      if (!sqlFactory) {
        sendJson(res, 503, { error: 'Database engine not ready' });
        return;
      }
      let db: Database;
      try {
        db = openReadonlyDb(dbPath);
      } catch (e) {
        sendJson(res, 500, { error: String(e) });
        return;
      }
      try {
        const rows = runAll(
          db,
          `SELECT id, project_id AS projectId, datetime(created_at) AS createdAt,
                  commit_hash AS commitHash, branch,
                  bundle_json AS bundleJson, lighthouse_json AS lighthouseJson,
                  knip_json AS knipJson, dependency_json AS dependencyJson,
                  collector_health_json AS collectorHealthJson
           FROM snapshots WHERE project_id = ?
           ORDER BY datetime(created_at) DESC LIMIT ?`,
          [projectId, limit]
        );

        const snapshots = rows.map((r) => {
          const bundleJson = (r.bundleJson ?? r.bundlejson ?? null) as string | null;
          const lighthouseJson = (r.lighthouseJson ?? r.lighthousejson ?? null) as string | null;
          const knipJson = (r.knipJson ?? r.knipjson ?? null) as string | null;
          const dependencyJson = (r.dependencyJson ?? r.dependencyjson ?? null) as string | null;
          const collectorHealthJson = (r.collectorHealthJson ?? r.collectorhealthjson ?? null) as string | null;

          const bundle = safeJson<{
            totalBytes: number;
            vendorBytes: number;
            source: string;
            largestChunks?: { name: string; bytes: number }[];
          }>(bundleJson);
          const lighthouse = safeJson<{
            performance: number | null;
            accessibility: number | null;
            bestPractices: number | null;
            seo: number | null;
          }>(lighthouseJson);
          const knip = safeJson<{
            unusedFiles: string[];
            unusedExports: string[];
            unusedDependencies: string[];
          }>(knipJson);
          const dependency = safeJson<{
            maxDepth: number;
            violationCount: number;
            circular: unknown[];
          }>(dependencyJson);
          const collectorHealth = safeJson<Record<string, { status: string; detail?: string; rawPaths?: string[] }>>(
            collectorHealthJson
          );

          return {
            id: Number(r.id ?? r.ID),
            projectId: Number(r.projectId ?? r.projectid),
            createdAt: String(r.createdAt ?? r.createdat ?? ''),
            commitHash: String(r.commitHash ?? r.commithash ?? ''),
            branch: String(r.branch ?? r.BRANCH ?? ''),
            bundle,
            lighthouse,
            knip: knip
              ? {
                  unusedFiles: knip.unusedFiles?.length ?? 0,
                  unusedExports: knip.unusedExports?.length ?? 0,
                  unusedDependencies: knip.unusedDependencies?.length ?? 0
                }
              : null,
            dependency: dependency
              ? {
                  maxDepth: dependency.maxDepth,
                  violationCount: dependency.violationCount,
                  circularCount: Array.isArray(dependency.circular) ? dependency.circular.length : 0
                }
              : null,
            collectorHealth
          };
        });

        sendJson(res, 200, { snapshots });
      } finally {
        db.close();
      }
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/snapshots/')) {
      const id = Number(pathname.replace('/api/snapshots/', ''));
      if (!Number.isFinite(id)) {
        next();
        return;
      }
      const dbPath = dbFilePath();
      if (!fs.existsSync(dbPath)) {
        sendJson(res, 404, { error: 'Database not found' });
        return;
      }
      if (!sqlFactory) {
        sendJson(res, 503, { error: 'Database engine not ready' });
        return;
      }
      const db = openReadonlyDb(dbPath);
      try {
        const row = runOne(db, `SELECT id, project_id AS projectId, datetime(created_at) AS createdAt,
                commit_hash AS commitHash, branch,
                bundle_json AS bundleJson, lighthouse_json AS lighthouseJson,
                knip_json AS knipJson, dependency_json AS dependencyJson,
                collector_health_json AS collectorHealthJson
         FROM snapshots WHERE id = ?`, [id]);
        if (!row) {
          sendJson(res, 404, { error: 'Snapshot not found' });
          return;
        }
        const bundleJson = (row.bundleJson ?? row.bundlejson ?? null) as string | null;
        const lighthouseJson = (row.lighthouseJson ?? row.lighthousejson ?? null) as string | null;
        const knipJson = (row.knipJson ?? row.knipjson ?? null) as string | null;
        const dependencyJson = (row.dependencyJson ?? row.dependencyjson ?? null) as string | null;
        const collectorHealthJson = (row.collectorHealthJson ?? row.collectorhealthjson ?? null) as string | null;

        sendJson(res, 200, {
          id: Number(row.id ?? row.ID),
          projectId: Number(row.projectId ?? row.projectid),
          createdAt: String(row.createdAt ?? row.createdat ?? ''),
          commitHash: String(row.commitHash ?? row.commithash ?? ''),
          branch: String(row.branch ?? row.BRANCH ?? ''),
          bundle: safeJson(bundleJson),
          lighthouse: safeJson(lighthouseJson),
          knip: safeJson(knipJson),
          dependency: safeJson(dependencyJson),
          collectorHealth: safeJson(collectorHealthJson)
        });
      } finally {
        db.close();
      }
      return;
    }

    next();
  });
}

export function observerDbApiPlugin(): Plugin {
  return {
    name: 'observer-db-api',
    async configureServer(server) {
      await ensureSql();
      setupApi(server.middlewares);
    },
    async configurePreviewServer(server) {
      await ensureSql();
      setupApi(server.middlewares);
    }
  };
}
