/** Класс для pill статуса коллектора (success / partial / failed). */
export function collectorPillClass(s: string | undefined): string {
  if (s === 'success') return 'ok';
  if (s === 'partial') return 'partial';
  if (s === 'failed') return 'bad';
  return '';
}
