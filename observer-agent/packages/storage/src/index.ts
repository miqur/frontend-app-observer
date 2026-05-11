import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { ProjectProfile } from '@observer/core';
import { ensureObserverLayout, migrateLegacyDatabaseIfNeeded } from '@observer/core';
import type {
  BundleMetrics,
  DependencyMetrics,
  KnipMetrics,
  LighthouseMetrics,
  SnapshotCollectorHealth,
  SnapshotRecord
} from '@observer/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDatabase(dbFilePath: string): Database.Database {
  migrateLegacyDatabaseIfNeeded();
  ensureObserverLayout();
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  const db = new Database(dbFilePath);
  db.pragma('journal_mode = WAL');
  const schemaPath = path.join(__dirname, 'schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  migrateSnapshotsCollectorHealthColumn(db);
  return db;
}

function migrateSnapshotsCollectorHealthColumn(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(snapshots)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'collector_health_json')) {
    db.exec(`ALTER TABLE snapshots ADD COLUMN collector_health_json TEXT`);
  }
}

export function upsertProject(db: Database.Database, profile: ProjectProfile, slug: string): number {
  const meta = JSON.stringify({
    sourceRoot: profile.sourceRoot,
    scripts: profile.scripts
  });
  const row = db
    .prepare(
      `SELECT id FROM projects WHERE path = @path`
    )
    .get({ path: profile.root }) as { id: number } | undefined;

  if (row) {
    db.prepare(
      `UPDATE projects SET name=@name, slug=@slug, package_manager=@pm, framework=@fw,
            has_vite=@hv, has_typescript=@hts, build_command=@bc, meta_json=@meta,
            updated_at=datetime('now') WHERE id=@id`
    ).run({
      id: row.id,
      name: profile.name,
      slug,
      pm: profile.packageManager,
      fw: profile.framework,
      hv: profile.hasVite ? 1 : 0,
      hts: profile.hasTypeScript ? 1 : 0,
      bc: profile.defaultAnalyzeBuildCommand,
      meta
    });
    return row.id;
  }

  const info = db
    .prepare(
      `INSERT INTO projects (path, slug, name, package_manager, framework, has_vite, has_typescript, build_command, meta_json)
       VALUES (@path, @slug, @name, @pm, @fw, @hv, @hts, @bc, @meta)`
    )
    .run({
      path: profile.root,
      slug,
      name: profile.name,
      pm: profile.packageManager,
      fw: profile.framework,
      hv: profile.hasVite ? 1 : 0,
      hts: profile.hasTypeScript ? 1 : 0,
      bc: profile.defaultAnalyzeBuildCommand,
      meta
    });

  return Number(info.lastInsertRowid);
}

export function insertSnapshot(
  db: Database.Database,
  projectId: number,
  row: {
    commitHash: string;
    branch: string;
    bundle: BundleMetrics | null;
    lighthouse: LighthouseMetrics | null;
    knip: KnipMetrics | null;
    dependency: DependencyMetrics | null;
    collectorHealth?: SnapshotCollectorHealth | null;
  }
): number {
  const stmt = db.prepare(`
    INSERT INTO snapshots (project_id, commit_hash, branch, bundle_json, lighthouse_json, knip_json, dependency_json, collector_health_json)
    VALUES (@project_id, @commit_hash, @branch, @b, @l, @k, @d, @h)
  `);
  const info = stmt.run({
    project_id: projectId,
    commit_hash: row.commitHash,
    branch: row.branch,
    b: row.bundle ? JSON.stringify(row.bundle) : null,
    l: row.lighthouse ? JSON.stringify(row.lighthouse) : null,
    k: row.knip ? JSON.stringify(row.knip) : null,
    d: row.dependency ? JSON.stringify(row.dependency) : null,
    h: row.collectorHealth ? JSON.stringify(row.collectorHealth) : null
  });
  return Number(info.lastInsertRowid);
}

function mapSnapshotRow(r: {
  id: number;
  created_at: string;
  commit_hash: string;
  branch: string;
  bundle_json: string | null;
  lighthouse_json: string | null;
  knip_json: string | null;
  dependency_json: string | null;
  collector_health_json?: string | null;
}): SnapshotRecord {
  return {
    id: r.id,
    createdAt: r.created_at,
    commitHash: r.commit_hash,
    branch: r.branch,
    bundle: r.bundle_json ? (JSON.parse(r.bundle_json) as BundleMetrics) : null,
    lighthouse: r.lighthouse_json ? (JSON.parse(r.lighthouse_json) as LighthouseMetrics) : null,
    knip: r.knip_json ? (JSON.parse(r.knip_json) as KnipMetrics) : null,
    dependency: r.dependency_json ? (JSON.parse(r.dependency_json) as DependencyMetrics) : null,
    collectorHealth: r.collector_health_json
      ? (JSON.parse(r.collector_health_json) as SnapshotCollectorHealth)
      : null
  };
}

export function getSnapshotsForProject(db: Database.Database, projectId: number, limit: number): SnapshotRecord[] {
  const rows = db
    .prepare(
      `SELECT id, created_at, commit_hash, branch, bundle_json, lighthouse_json, knip_json, dependency_json, collector_health_json
         FROM snapshots WHERE project_id = ? ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all(projectId, limit) as Array<{
    id: number;
    created_at: string;
    commit_hash: string;
    branch: string;
    bundle_json: string | null;
    lighthouse_json: string | null;
    knip_json: string | null;
    dependency_json: string | null;
    collector_health_json: string | null;
  }>;
  return rows.map(mapSnapshotRow);
}

export function getLatestSnapshot(db: Database.Database, projectId: number): SnapshotRecord | null {
  const rows = getSnapshotsForProject(db, projectId, 1);
  return rows[0] ?? null;
}

export function listProjects(db: Database.Database): Array<{ id: number; path: string; name: string; slug: string }> {
  return db
    .prepare(`SELECT id, path, name, slug FROM projects ORDER BY datetime(updated_at) DESC`)
    .all() as Array<{ id: number; path: string; name: string; slug: string }>;
}

export function findProjectByKey(
  db: Database.Database,
  key: string
): { id: number; path: string; name: string; slug: string } | null {
  if (/^\d+$/.test(key.trim())) {
    const row = db.prepare(`SELECT id, path, name, slug FROM projects WHERE id = ?`).get(Number(key)) as
      | { id: number; path: string; name: string; slug: string }
      | undefined;
    return row ?? null;
  }
  const all = listProjects(db);
  const k = key.toLowerCase();
  const resolvedKey = path.resolve(key);
  return (
    all.find((p) => p.path === resolvedKey) ??
    all.find((p) => p.slug === key) ??
    all.find((p) => p.name.toLowerCase() === k) ??
    all.find((p) => p.path.toLowerCase().includes(k)) ??
    null
  );
}

export function countSnapshots(db: Database.Database, projectId: number): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM snapshots WHERE project_id = ?`).get(projectId) as { c: number };
  return row.c;
}

export function insertRegressionEvents(
  db: Database.Database,
  args: {
    projectId: number;
    snapshotFromId: number | null;
    snapshotToId: number;
    issues: Array<{
      severity: string;
      kind: string;
      message: string;
      recommendation: string;
      source: string;
    }>;
  }
): void {
  db.prepare(`DELETE FROM regression_events WHERE project_id = ? AND snapshot_to_id = ?`).run(
    args.projectId,
    args.snapshotToId
  );
  if (!args.issues.length) return;
  const stmt = db.prepare(`
    INSERT INTO regression_events (project_id, snapshot_from_id, snapshot_to_id, severity, category, message, detail_json)
    VALUES (@project_id, @from_id, @to_id, @severity, @category, @message, @detail)
  `);
  const run = db.transaction(() => {
    for (const i of args.issues) {
      stmt.run({
        project_id: args.projectId,
        from_id: args.snapshotFromId,
        to_id: args.snapshotToId,
        severity: i.severity,
        category: i.kind,
        message: i.message,
        detail: JSON.stringify({ recommendation: i.recommendation, source: i.source })
      });
    }
  });
  run();
}

export function upsertTrendSample(
  db: Database.Database,
  projectId: number,
  snapshotId: number,
  snapshot: SnapshotRecord
): void {
  const bundle = snapshot.bundle?.totalBytes ?? null;
  const lh = snapshot.lighthouse?.performance ?? null;
  const unused = snapshot.knip?.unusedExports?.length ?? null;
  const depth = snapshot.dependency?.maxDepth ?? null;
  const viol = snapshot.dependency?.violationCount ?? null;
  db.prepare(
    `INSERT INTO trend_samples (project_id, snapshot_id, bundle_total_bytes, lighthouse_performance, unused_exports_count, max_dependency_depth, cruiser_violations)
     VALUES (@pid, @sid, @b, @lh, @u, @d, @v)
     ON CONFLICT(project_id, snapshot_id) DO UPDATE SET
       bundle_total_bytes = excluded.bundle_total_bytes,
       lighthouse_performance = excluded.lighthouse_performance,
       unused_exports_count = excluded.unused_exports_count,
       max_dependency_depth = excluded.max_dependency_depth,
       cruiser_violations = excluded.cruiser_violations,
       recorded_at = datetime('now')`
  ).run({ pid: projectId, sid: snapshotId, b: bundle, lh: lh, u: unused, d: depth, v: viol });
}

export function getRegressionEventsForProject(
  db: Database.Database,
  projectId: number,
  limit: number
): Array<{
  id: number;
  created_at: string;
  severity: string;
  category: string;
  message: string;
  snapshot_from_id: number | null;
  snapshot_to_id: number;
}> {
  return db
    .prepare(
      `SELECT id, created_at, severity, category, message, snapshot_from_id, snapshot_to_id
       FROM regression_events WHERE project_id = ? ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all(projectId, limit) as Array<{
    id: number;
    created_at: string;
    severity: string;
    category: string;
    message: string;
    snapshot_from_id: number | null;
    snapshot_to_id: number;
  }>;
}

export function getTrendSamplesForProject(
  db: Database.Database,
  projectId: number,
  limit: number
): Array<{
  snapshot_id: number;
  bundle_total_bytes: number | null;
  lighthouse_performance: number | null;
  unused_exports_count: number | null;
  recorded_at: string;
}> {
  return db
    .prepare(
      `SELECT snapshot_id, bundle_total_bytes, lighthouse_performance, unused_exports_count, recorded_at
       FROM trend_samples WHERE project_id = ? ORDER BY datetime(recorded_at) DESC LIMIT ?`
    )
    .all(projectId, limit) as Array<{
    snapshot_id: number;
    bundle_total_bytes: number | null;
    lighthouse_performance: number | null;
    unused_exports_count: number | null;
    recorded_at: string;
  }>;
}
