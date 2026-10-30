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
