/**
 * Which modules this deployment runs (072 review round 3; the module standard's `hasModule`). The app sets the list
 * once at boot from its generated registry, which already leaves out AMAX_MODULES_DISABLED. A module switched off
 * on a database that still holds its tables is then not installed, which a table check alone can't tell.
 *
 * Callers pass whether the module's tables exist (`tables`). A module counts only when it is installed and its tables
 * are there; before the list is set (a test that doesn't set it), the tables alone decide. So it never claims a
 * module that isn't there, and never one this deployment switched off.
 */
let ids: ReadonlySet<string> | null = null;

export const setInstalledModules = (moduleIds: readonly string[]) => { ids = new Set(moduleIds); };

export const hasModule = (id: string, tables: boolean) => tables && (ids === null || ids.has(id));

/**
 * 081 review round 1: what installed modules put in other modules' slots (the manifest's `provides`). The app sets it
 * once at boot beside setInstalledModules, from the same list, so a switched-off module provides nothing. Before it is
 * set (a test that doesn't), every slot is empty.
 */
let slots: ReadonlyMap<string, readonly unknown[]> | null = null;

export const setProvided = (modules: readonly { id: string; provides?: Record<string, unknown> }[]) => {
  const next = new Map<string, unknown[]>();
  for (const m of modules) for (const [slot, value] of Object.entries(m.provides ?? {})) next.set(slot, [...(next.get(slot) ?? []), value]);
  slots = next;
};

/** Everything installed modules put in `slot`, in module order; empty when none does (or before setProvided). */
export const provided = <T>(slot: string): readonly T[] => (slots?.get(slot) ?? []) as readonly T[];

/** 087 AC-8: whether setProvided ran in this process, so "nobody fills this slot" and "never asked" read differently. */
export const slotsSet = () => slots !== null;
