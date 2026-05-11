<script lang="ts">
  import type { Project } from '../../lib/types';
  import { projectFolderLabel } from '../../lib/format';

  let {
    projects,
    selectedId,
    onSelect,
    onDeleteRequest
  }: {
    projects: Project[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    onDeleteRequest: (p: Project, e: MouseEvent) => void;
  } = $props();
</script>

<h2 class="obs-panel-title">Проекты <span class="obs-count">{projects.length}</span></h2>
{#if projects.length === 0}
  <p class="obs-muted">Нет записей в таблице <code>projects</code>.</p>
{:else}
  <ul class="project-list">
    {#each projects as p (p.id)}
      {@const folder = projectFolderLabel(p.path)}
      <li class="project-row">
        <div class="project-card" class:active={selectedId === p.id}>
          <button type="button" class="card-body" onclick={() => onSelect(p.id)}>
            <div class="pcard-top">
              <span class="folder-ico" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 8a2 2 0 0 1 2-2h3.5l1 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <div class="pcard-titles">
                <span class="pdirname">{folder}</span>
                {#if p.name && p.name !== folder}
                  <span class="ppkg" title="Имя из package.json">{p.name}</span>
                {/if}
              </div>
            </div>
            <div class="pmeta-row">
              <span class="chip">{p.framework ?? '?'}</span>
              <span class="chip chip-dim">{p.packageManager ?? '?'}</span>
            </div>
            <span class="ppath" title={p.path}>{p.path}</span>
          </button>
          <button
            type="button"
            class="trash-btn"
            aria-label={`Удалить проект ${folder}`}
            title="Удалить из базы"
            onclick={(e) => onDeleteRequest(p, e)}
          >
            <svg class="trash-ico" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .project-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .project-row {
    min-width: 0;
  }

  .trash-btn {
    position: absolute;
    top: 0.72rem;
    right: 0.65rem;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.25);
    color: #8b9cb3;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s,
      transform 0.12s ease;
  }

  .trash-btn:hover {
    color: #ff8a7a;
    border-color: rgba(248, 81, 73, 0.45);
    background: rgba(248, 81, 73, 0.15);
    transform: scale(1.06);
  }

  .trash-btn:focus-visible {
    outline: 2px solid rgba(88, 166, 255, 0.65);
    outline-offset: 2px;
  }

  .trash-btn:active {
    transform: scale(0.96);
  }

  .trash-ico {
    display: block;
  }

  .project-card {
    position: relative;
    overflow: hidden;
    width: 100%;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: linear-gradient(165deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.22) 100%);
    color: inherit;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
    transition:
      border-color 0.18s,
      background 0.18s,
      box-shadow 0.18s;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 0.8rem 2.75rem 0.75rem 0.95rem;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 12px;
  }

  .card-body:focus-visible {
    outline: 2px solid rgba(88, 166, 255, 0.55);
    outline-offset: -2px;
  }

  .project-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #58a6ff 0%, #388bfd 100%);
    opacity: 0;
    transition: opacity 0.18s;
  }

  .project-card:hover {
    border-color: rgba(88, 166, 255, 0.42);
    box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.08);
  }

  .project-card:hover::before {
    opacity: 0.45;
  }

  .project-card.active {
    border-color: rgba(88, 166, 255, 0.65);
    background: linear-gradient(165deg, rgba(88, 166, 255, 0.12) 0%, rgba(0, 0, 0, 0.2) 100%);
    box-shadow:
      0 0 0 1px rgba(88, 166, 255, 0.12),
      0 8px 24px rgba(0, 0, 0, 0.25);
  }

  .project-card.active::before {
    opacity: 1;
  }

  .project-card.active .trash-btn {
    border-color: rgba(88, 166, 255, 0.22);
    background: rgba(0, 0, 0, 0.2);
  }

  .pcard-top {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    min-width: 0;
  }

  .folder-ico {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 8px;
    background: rgba(88, 166, 255, 0.1);
    color: #79b8ff;
  }

  .project-card.active .folder-ico {
    background: rgba(88, 166, 255, 0.18);
    color: #a5d6ff;
  }

  .pcard-titles {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
  }

  .pdirname {
    font-weight: 600;
    font-size: 1.02rem;
    letter-spacing: -0.025em;
    line-height: 1.25;
    color: #f0f4f8;
  }

  .ppkg {
    font-size: 0.72rem;
    color: #7d8fa3;
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
  }

  .pmeta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding-left: 0.1rem;
  }

  .chip {
    font-size: 0.68rem;
    font-weight: 500;
    text-transform: lowercase;
    letter-spacing: 0.02em;
    padding: 0.2rem 0.45rem;
    border-radius: 6px;
    background: rgba(88, 166, 255, 0.14);
    color: #b6d9ff;
    border: 1px solid rgba(88, 166, 255, 0.22);
  }

  .chip-dim {
    background: rgba(255, 255, 255, 0.06);
    color: #9aacbf;
    border-color: rgba(255, 255, 255, 0.1);
  }

  .ppath {
    font-size: 0.7rem;
    color: #5c6d82;
    word-break: break-all;
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    margin-top: 0.05rem;
    padding-top: 0.45rem;
  }
</style>
