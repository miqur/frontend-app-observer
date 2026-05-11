# Observer agent

Local-first, multi-project **engineering observability** CLI. Analyzes any frontend repository from the outside (no embedding in the target app): production build, bundle stats, Lighthouse on a static build folder (auto: `dist/`, `build/`, `.svelte-kit/output/client/`, `.svelte-kit/output/`), Knip, dependency-cruiser. All machine-local data lives under `~/.observer-agent/` (override with `OBSERVER_DATA_DIR`).

**Standalone use:** copy or clone only this `observer-agent` directory into its own Git repository, `npm install`, then `npm link` (or run via `node apps/cli/bin/run.mjs`).

## Install

```bash
cd observer-agent
npm install
npm link
```

Then run `observer` from any directory, or:

```bash
node /path/to/observer-agent/apps/cli/bin/run.mjs analyze ~/projects/my-app
```

## Commands

| Command | Description |
|--------|-------------|
| `observer analyze <path>` | Detect stack, run collectors, persist snapshot, terminal + markdown report |
| `observer analyze <path> --debug` | Same + verbose collector diagnostics and raw outputs under `~/.observer-agent/cache/raw/` |
| `observer history <project>` | Recent snapshots (project = numeric id, slug, name, or path substring) |
| `observer latest <project>` | Latest snapshot as JSON |
| `observer regressions <project>` | Pairwise diffs plus persisted regression rows from the DB |
| `observer help` | Full help (same as `observer --help`) |

Global flags (any position): `-v` / `--verbose`, `-q` / `--quiet`, `analyze` also accepts `--debug`. Env: `OBSERVER_VERBOSE`, `OBSERVER_QUIET`, `OBSERVER_DEBUG`, `OBSERVER_LOG_FILE=0` to disable JSON line logs.

## Per-project config (optional)

In the **analyzed** repository root, add `observer.config.ts` (or `.mts` / `.js` / `.mjs`). The loader merges a **partial** object with defaults:

```ts
export default {
  ignoredFolders: ['e2e'],
  build: { command: 'npm run build' },
  budgets: { minLighthousePerformance: 90 },
  // lighthouse: { staticDistDir: '.svelte-kit/output/client' }, // optional if auto-detect is wrong
  disabledCollectors: ['lighthouse'] // optional: 'bundle' | 'lighthouse' | 'knip' | 'dependency'
};
```

If the analyzed project depends on `@observer/config`, you can `import { defineObserverConfig } from '@observer/config'` for typed overrides.

## Data layout (`~/.observer-agent/`)

| Path | Purpose |
|------|--------|
| `data/metrics.db` | SQLite: projects, snapshots, `regression_events`, `trend_samples` |
| `cache/<projectId>/` | Per-project Lighthouse config copies, bundle stats cache |
| `cache/raw/<projectId>/<run-id>/` | Raw collector artifacts (LHCI stdout/stderr, knip, dependency-cruiser JSON, bundle diagnostics) for debugging |
| `reports/<slug>/` | Markdown reports + `last.txt` terminal summary |
| `logs/observer-YYYY-MM-DD.log` | Optional JSON-line session log |

Older installs used `observer.db` at the root of this directory; on first open it is **copied** to `data/metrics.db` if the new file does not exist yet.

## Architecture

- `apps/cli` — Commander entry, progress (ora), session logging
- `packages/core` — metrics types, project detector, paths
- `packages/shared` — collector ids / small shared helpers
- `packages/logger` — chalk-based leveled logging
- `packages/config` — thresholds, budgets, `loadObserverConfig`, disabled collectors
- `packages/git` — git metadata
- `packages/collectors` — bundle, Lighthouse, Knip, dependency-cruiser (`cwd` = target project)
- `packages/analyzers` — trends, scoring, budgets
- `packages/storage` — SQLite schema + queries
- `packages/reports` — regressions, enrich, terminal + markdown

Not included (by design): cloud sync, dashboard, AI, auth, realtime monitoring.
