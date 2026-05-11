import type { ObserverHealth, Project, SnapshotRow } from '../types';

export async function fetchHealth(): Promise<ObserverHealth> {
  const r = await fetch('/api/health');
  if (!r.ok) throw new Error(`health: ${r.status}`);
  return r.json() as Promise<ObserverHealth>;
}

export async function fetchProjects(): Promise<Project[]> {
  const r = await fetch('/api/projects');
  if (!r.ok) throw new Error(`projects: ${r.status}`);
  const j = (await r.json()) as { projects?: Project[] };
  return j.projects ?? [];
}

export async function fetchSnapshots(projectId: number, limit = 50): Promise<SnapshotRow[]> {
  const r = await fetch(`/api/projects/${projectId}/snapshots?limit=${limit}`);
  if (!r.ok) throw new Error(`snapshots: ${r.status}`);
  const j = (await r.json()) as { snapshots?: SnapshotRow[] };
  return j.snapshots ?? [];
}

export async function fetchSnapshotDetail(id: number): Promise<Record<string, unknown>> {
  const r = await fetch(`/api/snapshots/${id}`);
  if (!r.ok) throw new Error(`snapshot ${id}: ${r.status}`);
  return r.json() as Promise<Record<string, unknown>>;
}

export async function deleteProject(projectId: number): Promise<void> {
  const r = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
  const j = (await r.json()) as { ok?: boolean; error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
}
