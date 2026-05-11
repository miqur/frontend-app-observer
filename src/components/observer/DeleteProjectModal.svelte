<script lang="ts">
  import type { Project } from '../../lib/types';
  import { projectFolderLabel } from '../../lib/format';

  let {
    target,
    submitting,
    onClose,
    onConfirm
  }: {
    target: Project | null;
    submitting: boolean;
    onClose: () => void;
    onConfirm: () => void;
  } = $props();
</script>

<svelte:window
  onkeydown={(e) => {
    if (target && e.key === 'Escape' && !submitting) {
      e.preventDefault();
      onClose();
    }
  }}
/>

{#if target}
  {@const delFolder = projectFolderLabel(target.path)}
  <div
    class="modal-shell"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget && !submitting) onClose();
    }}
  >
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <h3 id="del-title" class="modal-title">Удалить проект?</h3>
      <p class="modal-text">
        Вы действительно хотите удалить проект
        <strong class="modal-name">{delFolder}</strong>
        {#if target.name && target.name !== delFolder}
          <span class="modal-pkg">(<code>package.json</code>: {target.name})</span>
        {/if}
        ? Будут удалены все снимки и связанные данные для этого пути в <code>metrics.db</code>.
      </p>
      <p class="modal-path mono" title={target.path}>{target.path}</p>
      <div class="modal-actions">
        <button type="button" class="obs-btn obs-btn--ghost" onclick={onClose} disabled={submitting}>Отмена</button>
        <button type="button" class="obs-btn obs-btn--danger" onclick={onConfirm} disabled={submitting}>
          {submitting ? 'Удаление…' : 'Удалить'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mono {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
  }

  .modal-shell {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    background: rgba(4, 8, 14, 0.72);
    backdrop-filter: blur(10px);
  }

  .modal-panel {
    width: min(420px, 100%);
    padding: 1.35rem 1.4rem 1.25rem;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(155deg, rgba(22, 30, 44, 0.98) 0%, rgba(12, 16, 23, 0.98) 100%);
    box-shadow:
      0 24px 48px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(88, 166, 255, 0.08) inset;
  }

  .modal-panel code {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 0.88em;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.12em 0.35em;
    border-radius: 4px;
  }

  .modal-title {
    margin: 0 0 0.85rem;
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #e8edf4;
  }

  .modal-text {
    margin: 0 0 0.65rem;
    font-size: 0.92rem;
    line-height: 1.55;
    color: #b8c5d6;
  }

  .modal-name {
    color: #e8edf4;
    font-weight: 600;
  }

  .modal-pkg {
    font-weight: 400;
    color: #8b9cb3;
    font-size: 0.88em;
  }

  .modal-pkg code {
    font-size: 0.95em;
  }

  .modal-path {
    margin: 0 0 1.25rem;
    font-size: 0.72rem;
    line-height: 1.45;
    color: #6b7c94;
    word-break: break-all;
    padding: 0.55rem 0.65rem;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
