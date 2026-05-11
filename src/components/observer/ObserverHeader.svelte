<script lang="ts">
  let {
    loading,
    onRefresh
  }: {
    loading: boolean;
    onRefresh: () => void;
  } = $props();
</script>

<header class="obs-hero">
  <div>
    <h1>Observer</h1>
    <p class="obs-lead">
      Проекты и снимки из локальной базы <code>metrics.db</code>. Удаление проекта в интерфейсе стирает его строку и связанные
      снимки в этой же базе.
    </p>
  </div>
  <button type="button" class="obs-btn obs-btn--ghost" onclick={onRefresh} disabled={loading}>Обновить</button>
</header>
