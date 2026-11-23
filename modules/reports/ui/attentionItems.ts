import type { PinRef } from "@amax/ui";
import type { Group } from "../server/roster";
import type { PersonRow, ProjectRow, ViewData } from "./data";
import { bandOfPct, first } from "./look";

export type Item = { k: "over" | "under" | "none"; p: PersonRow } | { k: "proj"; r: ProjectRow } | { k: "nogroup"; n: number; pin: PinRef };
export const TABS = 7;
export const idOf = (x: Item) => (x.k === "proj" ? x.r.id : x.k === "nogroup" ? "nogroup" : x.p.id);

const initialsOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);
export const lbl = (x: Item) => (x.k === "proj" ? x.r.name : x.k === "nogroup" ? "No time yet" : first(x.p.name));
export const tab = (x: Item) => (x.k === "proj" ? initialsOf(x.r.name) : x.k === "nogroup" ? String(x.n) : x.p.initials);

export function itemsOf(d: ViewData, g: Group): Item[] {
  const s = d.sides[g], band = (p: PersonRow) => bandOfPct(p.pct, d.target), none = s.rows.filter((p) => p.none);
  return [
    ...s.rows.filter((p) => band(p) === "over").map((p) => ({ k: "over" as const, p })),
    ...s.projects.rows.filter((r) => r.flag).map((r) => ({ k: "proj" as const, r })),
    ...s.rows.filter((p) => band(p) === "under").map((p) => ({ k: "under" as const, p })),
    ...(none.length > 3 ? [{ k: "nogroup" as const, n: none.length, pin: s.pin }] : none.map((p) => ({ k: "none" as const, p }))),
  ];
}
