import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { parseWeekKey } from "../week";
import { missingDays } from "./anomalies";
import { read } from "./read";
import { weekHours, type WeekRow } from "./weeks";

/** 073 AC-9: the submit card names the week and its hours, and warns about missing working days; it still submits. */
export async function submitCard(v: Viewer, a: { week: string }): Promise<ToolCard> {
  const w = parseWeekKey(a.week);
  const found = w && await read(v, async (tx) => {
    const [week] = (await tx.execute(sql`select * from time.week where user_id = ${v.userId} and iso_year = ${w.year} and iso_week = ${w.week}`)) as unknown as WeekRow[];
    return week ? { hours: Math.round((await weekHours(tx, week.id)) * 10) / 10, missing: await missingDays(tx, week, v) } : null;
  });
  if (!found) return { title: `Submit your timesheet for ${a.week}`, lines: [] };
  return { title: `Submit your timesheet for ${a.week} (${found.hours} h)`, look: { kind: "Submit timesheet", figure: `${found.hours} h`, subject: `Week ${a.week.split("-W")[1]}`, detail: a.week, who: "for you", confirm: "Submit", done: `Submitted ${a.week} · ${found.hours} h` },
    lines: found.missing.length ? [{ label: "Missing", value: `${found.missing.join(", ")}. You can still submit.` }] : [] };
}
