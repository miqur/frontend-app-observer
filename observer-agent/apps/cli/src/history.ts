import { defaultDatabasePath } from '@observer/core';
import { openDatabase, findProjectByKey, getSnapshotsForProject } from '@observer/storage';

export function runHistory(projectKey: string): void {
  const db = openDatabase(defaultDatabasePath());
  const p = findProjectByKey(db, projectKey);
  if (!p) {
    console.error(`Unknown project: ${projectKey}`);
    db.close();
    process.exitCode = 1;
    return;
  }
  const snaps = getSnapshotsForProject(db, p.id, 50);
  console.log(`Project #${p.id} ${p.name} (${p.path})`);
  console.log(`Slug: ${p.slug}\n`);
  for (const s of snaps) {
    const b = s.bundle ? `${(s.bundle.totalBytes / 1024).toFixed(1)} KB` : '—';
    const lh = s.lighthouse?.performance != null ? String(s.lighthouse.performance) : '—';
    console.log(`#${s.id}  ${s.createdAt}  ${s.commitHash.slice(0, 7)}  bundle:${b}  LH:${lh}`);
  }
  db.close();
}
