<script lang="ts">
  import type { ObserverHealth } from '../../lib/types';

  let {
    error,
    loading,
    health
  }: {
    error: string | null;
    loading: boolean;
    health: ObserverHealth | null;
  } = $props();
</script>

{#if error}
  <div class="obs-banner obs-banner--bad">{error}</div>
{/if}

{#if loading}
  <div class="obs-banner obs-banner--muted">Загрузка…</div>
{:else if health}
  <div class="obs-banner {health.exists ? 'obs-banner--ok' : 'obs-banner--warn'}">
    {#if health.exists}
      База найдена: <code>{health.dbPath}</code>
    {:else}
      Файл базы ещё не создан. Запустите анализ: <code>npm run observer</code> или
      <code>observer analyze &lt;путь&gt;</code>
    {/if}
  </div>
  {#if health.exists}
    <div class="obs-banner obs-banner--info">
      <strong>Диагностика:</strong>
      проектов в БД: <code>{health.projectCount ?? '?'}</code>,
      снимков: <code>{health.snapshotCount ?? '?'}</code>
      {#if health.dbError}
        <br /><span class="obs-bad-inline">Ошибка чтения: {health.dbError}</span>
      {/if}
      <br />
      <span class="obs-dim-line">os.homedir(): <code>{health.homedir ?? '—'}</code></span>
      {#if health.envObserverDataDir}
        <br /><span class="obs-dim-line">OBSERVER_DATA_DIR: <code>{health.envObserverDataDir}</code></span>
      {/if}
      {#if health.exists && (health.projectCount ?? 0) === 0 && (health.snapshotCount ?? 0) === 0}
        <p class="obs-hint">
          Таблицы пустые: сюда попадает только то, что записал <strong>этот же</strong> путь к данным Observer.
          Если анализ запускали в другом терминале с <code>OBSERVER_DATA_DIR</code>, создайте в корне этого проекта файл
          <code>.env.local</code> со строкой
          <code>OBSERVER_DATA_DIR=C:\Users\…\.observer-agent</code> и перезапустите <code>npm run dev</code>.
          Затем снова выполните <code>observer analyze …</code> или проверьте файл БД через DB Browser for SQLite.
        </p>
      {:else if health.exists && (health.projectCount ?? 0) === 0 && (health.snapshotCount ?? 0) > 0}
        <p class="obs-hint obs-bad-inline">
          Нестандартно: снимки есть, проектов нет. База могла быть повреждена; сделайте резервную копию и перезапустите analyze.
        </p>
      {/if}
    </div>
  {/if}
{/if}
