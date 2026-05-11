<script lang="ts">
  import { onMount } from 'svelte';
  import type { ObserverHealth, Project, SnapshotRow } from './lib/types';
  import {
    deleteProject,
    fetchHealth,
    fetchProjects,
    fetchSnapshotDetail,
    fetchSnapshots
  } from './lib/api/observer-client';
  import ObserverHeader from './components/observer/ObserverHeader.svelte';
  import HealthBanners from './components/observer/HealthBanners.svelte';
  import ProjectList from './components/observer/ProjectList.svelte';
  import SnapshotsPanel from './components/observer/SnapshotsPanel.svelte';
  import DeleteProjectModal from './components/observer/DeleteProjectModal.svelte';

  let health = $state<ObserverHealth | null>(null);
  let projects = $state<Project[]>([]);
  let selectedId = $state<number | null>(null);
  let snapshots = $state<SnapshotRow[]>([]);
  let loading = $state(true);
  let snapLoading = $state(false);
  let error = $state<string | null>(null);
  let expandedId = $state<number | null>(null);
  let expandedDetail = $state<Record<string, unknown> | null>(null);
  let deleteTarget = $state<Project | null>(null);
  let deleteSubmitting = $state(false);

  function openDeleteModal(p: Project, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    deleteTarget = p;
  }

  function closeDeleteModal() {
    if (deleteSubmitting) return;
    deleteTarget = null;
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    deleteSubmitting = true;
    error = null;
    try {
      await deleteProject(deleteTarget.id);
      const deletedId = deleteTarget.id;
      deleteTarget = null;
      projects = projects.filter((p) => p.id !== deletedId);
      if (selectedId === deletedId) {
        selectedId = null;
        snapshots = [];
      }
      health = await fetchHealth();
      if (projects.length === 1) await selectProject(projects[0]!.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      deleteSubmitting = false;
    }
  }

  async function bootstrap() {
    error = null;
    loading = true;
    try {
      health = await fetchHealth();
      projects = await fetchProjects();
      if (projects.length === 1) await selectProject(projects[0]!.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function selectProject(id: number) {
    selectedId = id;
    expandedId = null;
    expandedDetail = null;
    snapLoading = true;
    snapshots = [];
    try {
      snapshots = await fetchSnapshots(id, 50);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      snapLoading = false;
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      expandedId = null;
      expandedDetail = null;
      return;
    }
    expandedId = id;
    expandedDetail = null;
    try {
      expandedDetail = await fetchSnapshotDetail(id);
    } catch {
      expandedDetail = { error: 'Не удалось загрузить снимок' };
    }
  }

  onMount(() => {
    bootstrap();
  });
</script>

<svelte:head>
  <title>Observer — данные из базы</title>
</svelte:head>

<main class="obs-root">
  <ObserverHeader {loading} onRefresh={bootstrap} />
  <HealthBanners {error} {loading} {health} />

  <div class="obs-layout">
    <section class="obs-panel">
      <ProjectList {projects} {selectedId} onSelect={selectProject} onDeleteRequest={openDeleteModal} />
    </section>
    <section class="obs-panel obs-panel--grow">
      <SnapshotsPanel
        {selectedId}
        {snapLoading}
        {snapshots}
        {expandedId}
        {expandedDetail}
        onToggleExpand={toggleExpand}
      />
    </section>
  </div>
</main>

<DeleteProjectModal
  target={deleteTarget}
  submitting={deleteSubmitting}
  onClose={closeDeleteModal}
  onConfirm={confirmDeleteProject}
/>
