import { z } from "zod";
import { can } from "@amax/auth";
import { listSuggestions } from "@amax/agents/server";
import { changeIn, context } from "./mcp-context";
import { read, tool } from "./mcp-tool";
import { allOver, overLine, type Over } from "./server/over";
import { stillOver } from "./server/stale";

export const overTool = tool({ ...read, name: "get_over_allocation",
  description: "Facts only. Without person: every over-allocated person in your projects (or everyone you see if you manage none), each with the month, total, capacity, their biggest project you may change and its percent, and every project they are on that month with its percent (projects; name each one, never call a project other work). With person: the same for that one person, their first over-allocated month; use it when the user names a percent for someone but not the project or month (\"put Kasun to 60%\"), then call allocate once with that projectKey, that month and the user's percent. trimTo is the percent that would bring them back to capacity: use it only when the user asks to bring someone back to capacity, never propose it yourself. agentSuggests is the Allocation check's open suggestion for that person and month in its own words, or null when it has none: pass it on as it is. Show these facts; never suggest a change from them. Nothing is written.",
  input: z.object({ person: z.string().optional() }),
  run: async (v, a) => {
    const { mine, all } = await context(v);
    const may = (projectId: string) => can(v, "allocations:allocate", { projectId });
    const open = await listSuggestions(v, { bucket: "open", kind: "allocations.rebalance" });
    const change = changeIn(all);
    const withAgent = (o: Over) => { if (!o.found) return o; const s = open.find((x) => x.target.id.startsWith(`${o.personId}:`) && x.target.id.endsWith(`:${o.month}-01`)); return { ...o, agentSuggests: s ? change(s.proposed) : null }; };
    return a.person ? withAgent(overLine(all, a.person, may)) : { people: allOver(mine.scope === "managed" ? mine : all, may).map(withAgent) };
  } });

export const suggestionsTool = tool({ ...read, name: "list_allocation_suggestions",
  description: "The Allocation check's suggestions that still apply: open ones whose person is still over 100% that month, each with what happened and the change the check found (suggests: project and percent). Use this, never list_agent_suggestions, for allocation or AI suggestions. A suggestion that no longer applies (the person was fixed) is left out. Nothing is written.",
  input: z.object({}),
  run: async (v) => {
    const { all } = await context(v);
    const change = changeIn(all);
    const open = await listSuggestions(v, { bucket: "open", kind: "allocations.rebalance" });
    const still = await stillOver(v, open);
    return { suggestions: open.filter((s) => still.has(s.id)).map((s) => ({ happened: s.title, suggests: change(s.proposed), agent: s.agent.name })) };
  } });
