CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '3');

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  package_manager TEXT,
  framework TEXT,
  has_vite INTEGER NOT NULL DEFAULT 0,
  has_typescript INTEGER NOT NULL DEFAULT 0,
  build_command TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects (name);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  commit_hash TEXT NOT NULL,
  branch TEXT NOT NULL,
  bundle_json TEXT,
  lighthouse_json TEXT,
  knip_json TEXT,
  dependency_json TEXT,
  collector_health_json TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project_created ON snapshots (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_id ON snapshots (project_id, id DESC);

/** Persisted findings for cross-session regression history (derived from snapshots at analyze time). */
CREATE TABLE IF NOT EXISTS regression_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  snapshot_from_id INTEGER,
  snapshot_to_id INTEGER NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_from_id) REFERENCES snapshots(id) ON DELETE SET NULL,
  FOREIGN KEY (snapshot_to_id) REFERENCES snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_regressions_project_created ON regression_events (project_id, datetime(created_at) DESC);

/** Optional denormalized trend points (for future dashboard / queries without scanning all snapshots). */
CREATE TABLE IF NOT EXISTS trend_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  snapshot_id INTEGER NOT NULL,
  bundle_total_bytes INTEGER,
  lighthouse_performance INTEGER,
  unused_exports_count INTEGER,
  max_dependency_depth INTEGER,
  cruiser_violations INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
  UNIQUE (project_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_trend_samples_project ON trend_samples (project_id, datetime(recorded_at) DESC);
