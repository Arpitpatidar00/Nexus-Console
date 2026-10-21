import type { ActionItem } from './types';

export type SectionId = 'repeat' | 'pinned' | 'recentHosts' | 'recent' | ActionItem['group'];

export interface PaletteSection {
  group: SectionId;
  items: ActionItem[];
}

const isHostAction = (id: string) => id.startsWith('remote:');

/** The empty-query palette (PLAN F.6): repeat the last action, pinned actions,
 * recently used hosts, other recents, then the catalog by group. Each action
 * appears once, in the first section that claims it. `flat` is keyboard order. */
export function paletteSections(
  actions: ActionItem[],
  { pinnedIds, recentIds }: { pinnedIds: string[]; recentIds: string[] },
): { sections: PaletteSection[]; flat: ActionItem[] } {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const taken = new Set<string>();
  const take = (ids: string[]) =>
    ids.flatMap((id) => {
      const a = byId.get(id);
      if (!a || taken.has(id)) return [];
      taken.add(id);
      return [a];
    });

  const sections: PaletteSection[] = [
    { group: 'repeat', items: take(recentIds.slice(0, 1)) },
    { group: 'pinned', items: take(pinnedIds) },
    { group: 'recentHosts', items: take(recentIds.filter(isHostAction)) },
    { group: 'recent', items: take(recentIds) },
  ];

  const groups = new Map<ActionItem['group'], ActionItem[]>();
  for (const a of actions) {
    if (taken.has(a.id)) continue;
    groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  }
  for (const [group, items] of groups) sections.push({ group, items });

  const nonEmpty = sections.filter((s) => s.items.length > 0);
  return { sections: nonEmpty, flat: nonEmpty.flatMap((s) => s.items) };
}
