import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { personOf } from "./pins";
import { exportDescription, exportInput, exportTool } from "./export-tool";
import { pulseDescription, pulseInput, pulseTool } from "./pulse-tool";
import { showDescription, showInput, showTool } from "./show-tool";
import { availabilityCsv, utilisationCsv } from "./server/csv";
import { getPersonUtilisation } from "./server/person";
import { ctxFor } from "./server/read";
import { setHoliday, setUtilisationTarget } from "./server/settings";
import { getReport } from "./server/view";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "reports:read" };
const write = { scope: "write" as const, permission: "reports:admin" };
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "give the month as YYYY-MM").optional().describe("YYYY-MM; this month to date when left out");

const group = z.enum(["mine", "everyone"]).optional().describe("mine = the people on the projects you manage, everyone = everyone you may see; an Admin gets everyone and anyone else gets mine when left out");

async function utilisationReport(v: Viewer, a: { month?: string; group?: string; format?: "json" | "utilisation-csv" | "availability-csv" }) {
  const r = await getReport(v, a.month, a.group);
  if (a.format === "utilisation-csv") return { filename: `utilisation-${r.month}.csv`, csv: utilisationCsv(r) };
  if (a.format === "availability-csv") return { filename: `availability-${r.month}.csv`, csv: availabilityCsv(r.availability) };
  return r;
}

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_utilisation", description: "Utilisation (billable ÷ available hours) for a month, per person and for the team, against the target, with the 12-month trend and the rest of the month's availability (working days left after holidays and approved leave, allocated %, free hours). Counts only people whose timesheets, people record and leave you may see. format: a CSV export of either table.",
    input: z.object({ month, group, format: z.enum(["json", "utilisation-csv", "availability-csv"]).optional() }), run: (v, a) => utilisationReport(v, a) }),
  tool({ ...read, name: "show_reports", description: showDescription, input: showInput, run: (v, a) => showTool(v, a) }),
  tool({ ...read, name: "export_report", description: exportDescription, input: exportInput, run: (v, a) => exportTool(v, a) }),
  tool({ ...read, pin: "view", name: "get_delivery_pulse", description: pulseDescription, input: pulseInput, run: (v, a) => pulseTool(v, a) }),
  tool({ ...read, pin: { id: "userId", of: personOf as never }, name: "get_person_utilisation", description: "One person's utilisation for a month: available hours after leave and holidays, logged and billable hours, and their availability for the rest of the month. Null means you may not see that person's hours: say so plainly and offer the asker their own figure instead (071).",
    input: z.object({ userId: z.uuid(), month }), run: (v, a) => getPersonUtilisation(v, a.userId, a.month) }),
  tool({ ...write, permission: "reports:target", name: "set_utilisation_target", description: "Set the team utilisation target, in percent, that Reports compares against.",
    input: setUtilisationTarget.spec.input, service: setUtilisationTarget, run: (v, a, s) => setUtilisationTarget(ctxFor(v, s), a) }),
  tool({ ...write, name: "set_holiday", description: "Add, rename or (name null) remove a public holiday for a legal entity; available hours leave holidays out.",
    input: setHoliday.spec.input, service: setHoliday, run: (v, a, s) => setHoliday(ctxFor(v, s), a) }),
];
