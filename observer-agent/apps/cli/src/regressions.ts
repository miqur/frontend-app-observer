import { defaultDatabasePath } from '@observer/core';
import { loadObserverConfig } from '@observer/config';
import {
  openDatabase,
  findProjectByKey,
  getSnapshotsForProject,
  getRegressionEventsForProject
} from '@observer/storage';
import { buildRegressionHistory } from '@observer/reports';

export async function runRegressions(projectKey: string): Promise<void> {
  const db = openDatabase(defaultDatabasePath());
  const p = findProjectByKey(db, projectKey);
  if (!p) {
    console.error(`Unknown project: ${projectKey}`);
    db.close();
    process.exitCode = 1;
    return;
  }
  const config = await loadObserverConfig(p.path);
  const window = getSnapshotsForProject(db, p.id, Math.max(config.trends.windowRuns, 20));
  const hist = buildRegressionHistory(window, config, 15);
  if (!hist.length) {
    console.log('No pairwise regressions in recent snapshots.');
  } else {
    console.log('--- Pairwise (snapshot diff) ---');
    for (const h of hist) {
      console.log(`\n#${h.newerRunId} vs #${h.olderRunId}`);
      for (const m of h.messages) console.log(`  - ${m}`);
    }
  }

  const persisted = getRegressionEventsForProject(db, p.id, 40);
  if (persisted.length) {
    console.log('\n--- Persisted regression events (latest) ---');
    for (const r of persisted) {
      console.log(
        `[${r.severity}] #${r.snapshot_to_id} (${r.created_at}) ${r.category}: ${r.message}`
      );
    }
  } else {
    console.log('\nNo persisted regression rows yet (run analyze to populate).');
  }

  db.close();
}
