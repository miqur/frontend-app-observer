import { defaultDatabasePath } from '@observer/core';
import { openDatabase, findProjectByKey, getLatestSnapshot } from '@observer/storage';

export function runLatest(projectKey: string): void {
  const db = openDatabase(defaultDatabasePath());
  const p = findProjectByKey(db, projectKey);
  if (!p) {
    console.error(`Unknown project: ${projectKey}`);
    db.close();
    process.exitCode = 1;
    return;
  }
  const s = getLatestSnapshot(db, p.id);
  if (!s) {
    console.log('No snapshots yet. Run: observer analyze <path>');
    db.close();
    return;
  }
  console.log(JSON.stringify({ project: p, snapshot: s }, null, 2));
  db.close();
}
