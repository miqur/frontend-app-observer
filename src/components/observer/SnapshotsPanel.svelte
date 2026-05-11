<script lang="ts">
  import type { SnapshotRow } from '../../lib/types';
  import { formatBytes, lhCell } from '../../lib/format';
  import { collectorPillClass } from '../../lib/collector-status';

  let {
    selectedId,
    snapLoading,
    snapshots,
    expandedId,
    expandedDetail,
    onToggleExpand
  }: {
    selectedId: number | null;
    snapLoading: boolean;
    snapshots: SnapshotRow[];
    expandedId: number | null;
    expandedDetail: Record<string, unknown> | null;
    onToggleExpand: (id: number) => void;
  } = $props();
</script>

<h2 class="obs-panel-title">Снимки</h2>
{#if selectedId == null}
  <p class="obs-muted">Выберите проект слева.</p>
{:else if snapLoading}
  <p class="obs-muted">Загрузка снимков…</p>
{:else if snapshots.length === 0}
  <p class="obs-muted">Для этого проекта пока нет строк в <code>snapshots</code>.</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Время</th>
          <th>Коммит</th>
          <th>Ветка</th>
          <th>Бандл</th>
          <th>LH perf</th>
          <th>Knip</th>
          <th>Deps</th>
          <th>Статусы</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each snapshots as s (s.id)}
          <tr>
            <td class="mono sm">{s.createdAt}</td>
            <td class="mono sm">{s.commitHash.slice(0, 7)}</td>
            <td class="sm">{s.branch}</td>
            <td class="mono sm">
              {#if s.bundle}
                {formatBytes(s.bundle.totalBytes)}
                <span class="dim">({s.bundle.source})</span>
              {:else}
                —
              {/if}
            </td>
            <td class="mono sm">{lhCell(s.lighthouse?.performance)}</td>
            <td class="mono sm">
              {#if s.knip}
                F{s.knip.unusedFiles} / E{s.knip.unusedExports} / D{s.knip.unusedDependencies}
              {:else}
                —
              {/if}
            </td>
            <td class="mono sm">
              {#if s.dependency}
                d{s.dependency.maxDepth} · v{s.dependency.violationCount}
              {:else}
                —
              {/if}
            </td>
            <td class="health-cells">
              {#if s.collectorHealth}
                {#each Object.entries(s.collectorHealth) as [k, h] (k)}
                  <span class="pill {collectorPillClass(h?.status)}" title={h?.detail}>{k}</span>
                {/each}
              {:else}
                —
              {/if}
            </td>
            <td>
              <button type="button" class="obs-btn obs-btn--tiny" onclick={() => onToggleExpand(s.id)}>
                {expandedId === s.id ? 'Скрыть JSON' : 'JSON'}
              </button>
            </td>
          </tr>
          {#if expandedId === s.id}
            <tr class="expand-row">
              <td colspan="9">
                {#if expandedDetail}
                  <pre class="json">{JSON.stringify(expandedDetail, null, 2)}</pre>
                {:else}
                  <p class="obs-muted pad">Загрузка полного JSON…</p>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  th,
  td {
    padding: 0.5rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  th {
    color: #9aacbf;
    font-weight: 500;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .mono {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
  }

  .sm {
    font-size: 0.8rem;
  }

  .dim {
    color: #6b7c94;
    font-size: 0.72rem;
  }

  .health-cells {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .pill {
    font-size: 0.65rem;
    padding: 0.12rem 0.35rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: rgba(255, 255, 255, 0.08);
  }

  .pill.ok {
    background: rgba(46, 160, 67, 0.25);
    color: #56d364;
  }

  .pill.partial {
    background: rgba(210, 153, 34, 0.2);
    color: #e3b341;
  }

  .pill.bad {
    background: rgba(248, 81, 73, 0.2);
    color: #ff8a7a;
  }

  .expand-row td {
    padding: 0;
    border-bottom: none;
  }

  .json {
    margin: 0;
    padding: 0.75rem 1rem;
    max-height: 320px;
    overflow: auto;
    font-size: 0.72rem;
    line-height: 1.4;
    background: rgba(0, 0, 0, 0.35);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .pad {
    padding: 0.75rem 1rem;
    margin: 0;
  }
</style>
