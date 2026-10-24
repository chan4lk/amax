import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { refuse } from "./card";
import { mayDecide } from "./decide";
import { read } from "./read";
import { keyOf, weekHours, type WeekRow } from "./weeks";

// 070 amendment 4 (AC-46, AC-47): one card for several people's weeks. The card lists exactly the weeks in the
// input; nothing outside it is ever touched.
export type Kind = "remind" | "approve";
export type BulkResult = { person: string; week: string; status: "done" | "skipped" | "failed"; note: string | null };

export const STATUS = { draft: "Draft", rejected: "Sent back", submitted: "Submitted", approved: "Approved" } as Record<string, string>;
export const eligible: Record<Kind, (w: WeekRow) => boolean> = {
  remind: (w) => w.status === "draft" || w.status === "rejected",
  approve: (w) => w.status === "submitted",
};
export const words = { remind: ["Reminded", "sent"], approve: ["Approved", "approved"] } as const;

/** The input's weeks the viewer is in the approval chain for, in the input's order, with their hours; the rest are left out. */
async function weeks(v: Viewer, ids: string[]) {
  return read(v, async (tx) => {
    const rows = (await tx.execute(sql`select * from time.week where id::text in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)) as unknown as WeekRow[];
    const may = mayDecide(tx, v);
    const out: { week: WeekRow; hours: number }[] = [];
    rows.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
    for (const w of rows) if (await may(w)) out.push({ week: w, hours: Math.round((await weekHours(tx, w.id)) * 10) / 10 });
    return out;
  });
}

export const proposeBulk = (kind: Kind) => async (v: Viewer, a: { weekIds: string[] }) => {
  if (!(await weeks(v, a.weekIds)).some((w) => eligible[kind](w.week))) refuse(`none of those timesheets can be ${kind === "remind" ? "reminded (they're submitted or approved)" : "approved (none is submitted)"}; read get_team_week for the week ids`);
};

export const bulkCard = (kind: Kind) => async (v: Viewer, a: { weekIds: string[] }): Promise<ToolCard> => {
  const all = await weeks(v, a.weekIds);
  const go = all.filter((w) => eligible[kind](w.week));
  const keys = [...new Set(go.map((w) => keyOf(w.week)))].join(", ");
  const hours = Math.round(go.reduce((n, w) => n + w.hours, 0) * 10) / 10;
  const title = kind === "remind" ? `Remind ${go.length} ${go.length === 1 ? "person" : "people"} to submit ${keys}` : `Approve ${go.length} ${go.length === 1 ? "timesheet" : "timesheets"} for ${keys} (${hours} h)`;
  const line = (w: (typeof all)[number]): CardLine => ({ label: w.week.person_name as string, value: `${STATUS[w.week.status] ?? w.week.status}, ${w.hours} h` });
  const skip = all.filter((w) => !eligible[kind](w.week)).map((w) => ({ label: w.week.person_name as string, value: `skipped: ${STATUS[w.week.status] ?? w.week.status}` }));
  const outside = a.weekIds.length - all.length;
  return { title, lines: [...go.map(line), ...skip, ...(outside ? [{ label: "Skipped", value: `${outside} you can't act on` }] : [])] };
};
