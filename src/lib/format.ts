export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export function lhCell(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return String(v);
}

/** Последний сегмент пути (имя папки проекта), Windows и POSIX. */
export function projectFolderLabel(projectPath: string): string {
  const t = projectPath.trim().replace(/[/\\]+$/, '');
  if (!t) return '—';
  const parts = t.split(/[/\\]/);
  const last = parts.pop();
  return (last && last.length > 0 ? last : t) || '—';
}
