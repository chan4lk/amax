import { filterOf, type Filter } from "./attention";
import { monthLabel } from "./months";

export type Show = { q?: string; filter?: Filter; everyone?: boolean; bench?: string };

const monthOf = (value?: string) => (value && /^\d{4}-\d{2}-01$/.test(value) ? value : undefined);

export const showOf = (params: Record<string, string | undefined>): Show => ({
  q: params.q?.trim().slice(0, 60) || undefined,
  filter: filterOf(params.filter),
  everyone: params.view === "everyone",
  bench: monthOf(params.bench),
});

export function showPath(show: Show) {
  const query = new URLSearchParams();
  if (show.everyone) query.set("view", "everyone");
  if (show.filter && show.filter !== "all") query.set("filter", show.filter);
  if (show.q) query.set("q", show.q);
  if (show.bench) query.set("bench", show.bench);
  const text = query.toString();
  return text ? `/allocations?${text}` : "/allocations";
}

const FILTER_WORDS = { over: "over-allocated people", bench: "people on the bench" } as const;

export function showLine(show: Show) {
  const things = [
    show.q && `people starting with ${show.q}`,
    show.filter && show.filter !== "all" && FILTER_WORDS[show.filter],
    show.bench && `the bench in ${monthLabel(show.bench, "long")}`,
  ].filter(Boolean);
  const view = show.everyone ? "Everyone" : "My projects";
  if (things.length) return `Showing ${things.join(" and ")} in ${view}`;
  return show.everyone ? "Showing Everyone" : "";
}
