import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { getReport } from "./server/view";
import { BANDS, describe, filtered, filterOf } from "./ui/filter";

export const showInput = z.object({
  tab: z.enum(["utilisation", "availability"]).optional().describe("Which table to show; utilisation when left out"),
  band: z.enum([...BANDS, "all"]).optional().describe("under = under the target, on = target to 100%, over = above 100%, none = no submitted time yet, all = everyone"),
  group: z.enum(["mine", "everyone"]).optional().describe("mine = the people on the projects you manage, everyone = everyone you may see; an Admin gets everyone and anyone else gets mine when left out"),
  find: z.string().max(60).optional().describe("Part of a person's name, to show only them"),
});

export const showDescription = "Change what the Reports page shows, so the user sees the answer on screen as well as in chat: the Utilisation or Availability table, only people under target, on target, over 100% or with no time yet, and/or people whose name contains some text. Returns the people now shown with their figures. Call it whenever the user asks to see, show, list or filter people on Reports.";

export async function showTool(v: Viewer, a: z.infer<typeof showInput>) {
  const f = filterOf({ band: a.band === "all" ? undefined : a.band, find: a.find });
  const r = filtered(await getReport(v, undefined, a.group), f);
  const query = new URLSearchParams(Object.entries({ view: a.tab === "availability" ? "availability" : undefined, group: a.group, band: f.band, find: f.find }).filter((e): e is [string, string] => typeof e[1] === "string"));
  const qs = query.toString();
  return {
    show: `/reports${qs ? `?${qs}` : ""}`,
    showing: describe(f) || "everyone you may see",
    people: r.rows.map((x) => ({ name: x.name, utilisation: x.utilisation, available: x.availableHours, billable: x.billableHours, note: x.noTime ? "no submitted time yet" : x.leaveLabel })),
    team: { utilisation: r.team.utilisation, target: r.target },
  };
}
