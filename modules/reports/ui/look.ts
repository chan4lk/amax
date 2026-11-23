import type { Group } from "../server/roster";

export const COL: Record<Group, { c: string; d: string; arc: string; soft: string; mid: string }> = {
  mine: { c: "#7B61FF", d: "#5B44D6", arc: "#8F7BFF", soft: "#D9D1FF", mid: "#B7A9FF" },
  everyone: { c: "#3FB8E0", d: "#0B7C99", arc: "#3FB8E0", soft: "#CDEBF6", mid: "#8FD6EE" },
};

export type Band = "under" | "on" | "over" | "none";
export const bandOfPct = (pct: number | null, target: number): Band => (pct === null ? "none" : pct > 100 ? "over" : pct >= target ? "on" : "under");
export const BAND_COLOR: Record<Band, string> = { over: "#C2412D", on: "#2FCB8C", under: "#F2A93B", none: "#C9C5DC" };
export const first = (name: string) => name.split(" ")[0];
