import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import { context } from "./mcp-context";
import { overTool, suggestionsTool } from "./mcp-over";
import { read, tool } from "./mcp-tool";
import { attention, matching, shown } from "./server/attention";
import { benchMonths } from "./server/bench";
import { inWindow, monthLabel } from "./server/months";
import { viewFor } from "./server/route";
import { showLine, showPath, type Show } from "./server/show";
import { loadSummary } from "./server/load-summary";
import { summaryOf } from "./server/summary";

const month = z.string().regex(/^\d{4}-\d{2}$/);
const names = (grid: { people: { name: string }[] }) => grid.people.map((p) => p.name);

const showTool = tool({ ...read, name: "show_allocations",
  description: "Use this first whenever the user says show, find or look at someone in allocations, or asks to see over-allocated people or the bench for a month: it changes what the Allocations screen shows and reads the answer back. name: the start of a person's name (checks My projects first, then Everyone); filter: over or bench; view: mine or everyone; benchMonth: YYYY-MM for the bench card. Nothing is written. Say what you did in one line.",
  input: z.object({ name: z.string().optional(), filter: z.enum(["all", "over", "bench"]).optional(), view: z.enum(["mine", "everyone"]).optional(), benchMonth: month.optional() }),
  run: async (v, a) => {
    const { forecast, mine, all, known } = await context(v);
    const everyone = a.name ? viewFor(a.name, names(mine), names(all), a.view === "everyone") : a.view === "everyone";
    const found = matching((everyone ? all : mine).people, a.name);
    if (a.name && !found.length) return { shown: false, note: `Nobody's name starts with ${a.name}. The screen is unchanged.` };
    const show: Show = { q: a.name, filter: a.filter, everyone, bench: a.benchMonth && `${inWindow(a.benchMonth, forecast.months.map((m) => m.month))}-01` };
    const people = shown(found, attention(all, forecast.months, known), a.filter ?? "all");
    return { shown: true, show: showPath(show), line: showLine(show), count: people.length, people: people.slice(0, 10).map((p) => ({ name: p.name, months: p.totals.map((t, i) => `${monthLabel(all.months[i].month)} ${t}% of ${p.capacity[i]}%`) })) };
  } });

const benchTool = tool({ ...read, name: "get_bench",
  description: "Who is on the bench, each person with the months they are on it. months: YYYY-MM list (default all forecast months); inAll: true keeps only people on the bench in every month asked for.",
  input: z.object({ months: z.array(month).optional(), inAll: z.boolean().optional() }),
  run: async (v, a) => {
    const { forecast, known } = await context(v);
    const asked = a.months?.map((m) => inWindow(m, forecast.months.map((x) => x.month)));
    const people = benchMonths(forecast.months, known, asked ?? [], a.inAll ?? false);
    const one = asked?.length === 1 ? { show: showPath({ bench: `${asked[0]}-01` }) } : {};
    return { ...one, people: people.map((p) => ({ name: p.name, skill: p.skill, months: p.months.map((m) => monthLabel(m, "long")) })) };
  } });

const summaryTool = tool({ ...read, name: "allocation_summary",
  description: "Use this for \"how is the team looking\" questions about allocations. A short paragraph on who is over-allocated, who has nothing planned and how demand compares with capacity, ready to paste. Covers your projects, or everyone you can see if you manage none or everyone is true.",
  input: z.object({ everyone: z.boolean().optional() }),
  run: async (v, a) => {
    const { forecast, mine, all, known } = await context(v);
    return summaryOf(a.everyone || mine.scope === "none" ? all : mine, forecast.months, known);
  } });

const loadTool = tool({ ...read, name: "get_load_summary",
  description: "Use this for every question about capacity, demand, planned, spare, short, free, FTE, load or \"how loaded are we\". Per month (the five shown): how many FTE the people have (capacityFte), how many FTE are planned (plannedFte), the spare or short FTE (spareFte, negative is short), the load percent, who is over 100%, who has room (free, in percent of a full month) and who has nothing planned, with a ready sentence per month; and the whole delivery team's capacity and demand for the same month (team). Covers your projects' people, or everyone you can see if you manage none or everyone is true; scope says which. The numbers are already worked out: read them out, never recalculate. Nothing is written.",
  input: z.object({ everyone: z.boolean().optional() }),
  run: async (v, a) => {
    const { forecast, mine, all } = await context(v);
    const everyone = a.everyone || mine.scope === "none";
    const grid = everyone ? all : mine;
    const scope = everyone ? `everyone you can see, ${grid.people.length} people` : `your ${grid.people.length} people`;
    return { scope, today: new Date().toISOString().slice(0, 10), months: loadSummary(grid, forecast.months, scope) };
  } });

export const viewTools: McpToolDef[] = [showTool, benchTool, overTool, summaryTool, loadTool, suggestionsTool];
