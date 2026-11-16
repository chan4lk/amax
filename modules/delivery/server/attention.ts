import type { Viewer } from "@amax/auth";
import { listSuggestions } from "@amax/agents/server";
import type { ProposalRow } from "./queries";
import { hasNoOwner, isReadyToVerify, overEstimate } from "./readiness";

/**
 * 081 amendment 11 (AC-95): why an open proposal needs someone, in the order the list shows them. One rule for the
 * attention strip, the table's order and chips, and `list_proposals`' `need` option.
 */
export const NEEDS = ["suggested", "ready", "over", "unassigned"] as const;
export type Need = (typeof NEEDS)[number];
export const NEED_LABEL: Record<Need, string> = { suggested: "amax suggests", ready: "Ready to verify", over: "Over the estimate", unassigned: "Unassigned" };
export const isNeed = (x: unknown): x is Need => (NEEDS as readonly string[]).includes(x as string);

const DELIVERY = /^delivery\.proposal-/;

/** The proposals with an open Delivery suggestion this viewer may decide (listSuggestions applies the permission). */
export async function suggestedIds(v: Viewer, rows: { id: string }[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const ids = new Set(rows.map((r) => r.id));
  const open = await listSuggestions(v, { bucket: "open" });
  return new Set(open.filter((s) => DELIVERY.test(s.kind) && ids.has(s.target.id)).map((s) => s.target.id));
}

/** The reasons a row needs attention, in AC-95's order; none for a released or withdrawn one. */
export function needsOf(p: ProposalRow, suggested: Set<string>): Need[] {
  if (p.withdrawn || p.phase === "released") return [];
  const out: Need[] = [];
  if (suggested.has(p.id)) out.push("suggested");
  if (isReadyToVerify(p)) out.push("ready");
  if (overEstimate(p)) out.push("over");
  if (hasNoOwner(p)) out.push("unassigned");
  return out;
}

/** AC-96, AC-97: each row's reasons, the count per reason, and the rows with attention first (stable otherwise). */
export function attention(rows: ProposalRow[], suggested: Set<string>) {
  const needs = new Map(rows.map((p) => [p.id, needsOf(p, suggested)]));
  const counts = Object.fromEntries(NEEDS.map((n) => [n, rows.filter((p) => needs.get(p.id)!.includes(n)).length])) as Record<Need, number>;
  const rank = (p: ProposalRow) => { const n = needs.get(p.id)!; return n.length ? NEEDS.indexOf(n[0]) : NEEDS.length; };
  const ordered = rows.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
  return { needs, counts, ordered };
}

/** `list_proposals` with `need`: only the rows with that reason, attention order kept. */
export async function withNeed(v: Viewer, rows: ProposalRow[], need: Need) {
  const { needs, ordered } = attention(rows, await suggestedIds(v, rows));
  return ordered.filter((p) => needs.get(p.id)!.includes(need));
}
