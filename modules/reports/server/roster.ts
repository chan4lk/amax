import { listAllocations } from "@amax/allocations/contracts";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { hasModule } from "@amax/core/server";
import { installed } from "./read";

export const seesEveryone = (v: Viewer) => can(v, "reports:admin");

export type Group = "mine" | "everyone";
export const groupOf = (v: Viewer, asked?: string): Group => (asked === "mine" || asked === "everyone" ? asked : seesEveryone(v) ? "everyone" : "mine");
export const groupLabel = (g: Group) => (g === "everyone" ? "Everyone" : "Your people");

export async function rosterOf(tx: Tx, v: Viewer, month: string, group: Group = groupOf(v)): Promise<Set<string>> {
  if (!hasModule("allocations", await installed(tx, "allocations.allocation"))) return new Set();
  const everyone = group === "everyone";
  if (!everyone && !v.managedProjects.length) return new Set();
  const range = { from: `${month}-01`, to: `${month}-01` };
  const { rows } = await listAllocations(tx, v, everyone ? range : { ...range, projectIds: v.managedProjects });
  return new Set(rows.map((r) => r.personId));
}
