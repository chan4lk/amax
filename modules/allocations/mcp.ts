import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import { ctxFor } from "./server/context";
import { read, tool } from "./mcp-tool";
import { viewTools } from "./mcp-views";
import { forecastFor } from "./server/forecast";
import { gridFor } from "./server/grid";
import { getAllocation } from "./server/row";
import { teamFor } from "./server/team";
import { allocateOnly } from "./server/only";
import { allocate, copyMonth } from "./server/services";
import { addCard, proposeAllocate as checkPerson, type AddInput } from "./server/add-card";
import { overCheck, overNote, scopeCheck } from "./server/overcheck";
import { windowMonths } from "./server/months";

// 107: a card's fields arrive as text, so the percent and "until further notice" are read from it as numbers and booleans.
const flag = z.preprocess((x) => (x === "true" ? true : x === "false" ? false : x), z.boolean());
const number = z.preprocess((x) => (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : x), z.number().int());
const AllocateInput = z.object({ person: z.string().min(1), projectKey: z.string().optional(), work: z.string().optional(), month: z.string().optional(), through: z.string().optional(),
  percent: number, standing: flag.optional(), overOk: z.boolean().optional() });

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_capacity_forecast", description: "Capacity against demand (FTE) for the next six months, and who is on the bench each month with their skill.",
    input: z.object({ team: z.string().optional() }), run: (v, a) => forecastFor(v, a) }),
  tool({ ...read, pin: "view", name: "list_allocations", description: "Per-person monthly allocations for the next six months on the projects you manage (or everyone), with totals and capacity.",
    input: z.object({ everyone: z.boolean().optional() }), run: (v, a) => gridFor(v, a) }),
  tool({ ...read, pin: "view", name: "get_allocation", description: "One row of the allocations grid: a person (employee number or name) on one project (projectId) or other work, per month; with neither, the person's monthly totals against capacity.",
    input: z.object({ person: z.string(), projectId: z.string().uuid().optional(), work: z.string().optional() }), run: (v, a) => getAllocation(v, a) }),
  tool({ ...read, pin: "view", name: "get_project_team", description: "Who is allocated to a project (key such as CON) this month and the next two, with role and percent per month; optionally one person by employee number.",
    input: z.object({ projectKey: z.string(), person: z.string().optional() }),
    run: async (v, a) => { const t = await teamFor(v, a.projectKey); return t && a.person ? { ...t, people: t.people.filter((p) => p.employeeNo === a.person) } : t; } }),
  tool({ name: "allocate", description: "Allocate a person (write their full name as shown on screen, or the employee number) to a project key, or to other work, for a month (default this month) or a range of months (YYYY-MM). A month named alone means that one month only: leave through out. Set through (the last month) only when the user names an end or a span, such as \"until March\", \"through March\" or \"for the next 3 months\". Percent 0 removes it. standing true keeps them on the project every month from `month` until further notice (no `through`); percent 0 with standing true ends it from that month. In chat, for \"add someone to KEY\", call it at once with the projectKey and whoever was named: the card offers likely people, the percent and how long. Make one call, and so one card, for every change the user asks for, all in the same turn. If the change would put the person over 100% in a month, no card is made and you are told who and what total: say it in one line and ask \"Are you sure?\". Only if they say yes, call allocate again with the same values and overOk: true. When no percent is given (\"a bit\"), don't pick one: ask what percent, saying their free capacity that month. Next month means the month after today's.",
    scope: "write", permission: "allocations:allocate", input: AllocateInput, draft: AllocateInput.partial(), card: addCard,
    propose: async (v, input) => { const a = input as AddInput; await checkPerson(v, a); if (!a.person || a.percent === undefined) return; const ask = { ...a, person: a.person, percent: a.percent, month: a.month ?? windowMonths(new Date(), 1)[0] }; await scopeCheck(v, ask); if (a.standing === undefined) await overCheck(v, ask); },
    note: async (v, input) => { const a = input as AddInput; if (!a.person || a.percent === undefined || !(a.projectKey ?? a.work)) return undefined; return overNote(v, { ...a, person: a.person, percent: a.percent, month: a.month ?? windowMonths(new Date(), 1)[0] }); },
    service: allocate, run: (v, a, s = "mcp") => allocate(ctxFor(v, s), { ...a, month: a.month ?? windowMonths(new Date(), 1)[0] }) }),
  tool({ name: "allocate_only", description: "Put a person on one project (key such as CON) or other work for one month (YYYY-MM) and clear all their other projects in that month, in one step. A month named alone means that one month only: leave through out, and set it only when the user names an end or a span. Use this, with one call, for \"put X fully on project Y\" or \"only on Y\"; percent defaults to 100. Do not use allocate twice for that.",
    scope: "write", permission: "allocations:allocate",
    input: z.object({ person: z.string(), projectKey: z.string().optional(), work: z.string().optional(), month: z.string(), through: z.string().optional(), percent: z.number().int().optional() }),
    propose: (v, a) => scopeCheck(v as never, a as never, true),
    service: allocateOnly, run: (v, a, s = "mcp") => allocateOnly(ctxFor(v, s), a) }),
  tool({ name: "copy_allocations_to_next_month", description: "Copy a month's allocations into the month after, leaving anything already planned there.", scope: "write", permission: "allocations:copy",
    input: z.object({ from: z.string(), team: z.string().optional() }), service: copyMonth, run: (v, a, s = "mcp") => copyMonth(ctxFor(v, s), a) }),
  ...viewTools,
];
