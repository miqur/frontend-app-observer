/** Built-in collector identifiers (extensible list for future collectors). */
export const COLLECTOR_IDS = ['bundle', 'lighthouse', 'knip', 'dependency'] as const;
export type CollectorId = (typeof COLLECTOR_IDS)[number];

export function isCollectorId(s: string): s is CollectorId {
  return (COLLECTOR_IDS as readonly string[]).includes(s);
}

export function isCollectorEnabled(disabled: readonly string[] | undefined, id: CollectorId): boolean {
  return !(disabled ?? []).includes(id);
}
