import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { refuse } from "./card";
import { mayDecide } from "./decide";
import { read } from "./read";
import { weekAnomalies } from "./anomalies";
import { agoText, recentReminders } from "./reminders";
import { notStartedIn } from "./not-started";
import { keyOf, weekHours, type WeekRow } from "./weeks";

type BulkInput = { weekIds?: string[]; week?: string; userIds?: string[] };
// 073: the Not started people a remind card names (no timesheet that week), checked as the service checks them.
const notStarted = (v: Viewer, a: BulkInput) => (a.userIds?.length && a.week ? read(v, (tx) => notStartedIn(tx, v, a.week!, a.userIds!)) : Promise.resolve([]));

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

export const proposeBulk = (kind: Kind) => async (v: Viewer, a: BulkInput) => {
  const all = await weeks(v, a.weekIds ?? []);
  // 073 AC-10: when every submitted week needs a closer look, there's nothing to approve in bulk.
  if (kind === "approve" && all.some((w) => eligible.approve(w.week))) {
    const flagged = await read(v, async (tx) => Promise.all(all.filter((w) => eligible.approve(w.week)).map(async (w) => ({ who: w.week.person_name as string, checks: await weekAnomalies(tx, w.week) }))));
    if (flagged.every((f) => f.checks.length)) refuse(`every submitted timesheet there needs individual review (${flagged.map((f) => `${f.who}: ${f.checks.join("; ")}`).join(" · ")}); open each with approve_week`);
  }
  if (kind === "remind" && (await notStarted(v, a)).some((p) => p.ok)) return;
  if (!all.some((w) => eligible[kind](w.week))) refuse(`none of those timesheets can be ${kind === "remind" ? "reminded (they're submitted or approved)" : "approved (none is submitted)"}; read get_team_week for the week ids`);
};

export const bulkCard = (kind: Kind) => async (v: Viewer, a: BulkInput): Promise<ToolCard> => {
  const all = await weeks(v, a.weekIds ?? []);
  const fresh = kind === "remind" ? await notStarted(v, a) : [];
  const newcomers = fresh.filter((p) => p.ok);
  // 073 AC-10: anomalous weeks are listed as skipped, never approved in bulk.
  const checks = new Map(kind === "approve" ? await read(v, async (tx) => Promise.all(all.map(async (w) => [w.week.id, await weekAnomalies(tx, w.week)] as const))) : []);
  const flagged = (w: (typeof all)[number]) => (checks.get(w.week.id)?.length ?? 0) > 0;
  const go = all.filter((w) => eligible[kind](w.week) && !flagged(w));
  const keys = [...new Set([...go.map((w) => keyOf(w.week)), ...(newcomers.length ? [a.week!] : [])])].join(", ");
  const hours = Math.round(go.reduce((n, w) => n + w.hours, 0) * 10) / 10;
  const count = go.length + newcomers.length;
  const title = kind === "remind" ? `Remind ${count} ${count === 1 ? "person" : "people"} to submit ${keys}` : `Approve ${go.length} ${go.length === 1 ? "timesheet" : "timesheets"} for ${keys} (${hours} h)`;
  const recent = kind === "remind" ? await read(v, (tx) => recentReminders(tx, [...go.map((w) => w.week.user_id), ...newcomers.map((p) => p.userId)])) : new Map();
  const ago = (userId: string) => { const r = recent.get(userId); return r ? ` · reminded ${agoText(r.at)} by ${r.by}` : ""; };
  const warn = (w: (typeof all)[number]) => ago(w.week.user_id);
  const line = (w: (typeof all)[number]): CardLine => ({ label: w.week.person_name as string, value: `${STATUS[w.week.status] ?? w.week.status}, ${w.hours} h${warn(w)}` });
  const skip = all.filter((w) => !eligible[kind](w.week) || flagged(w)).map((w) => ({ label: w.week.person_name as string,
    value: eligible[kind](w.week) ? `skipped, needs individual review: ${checks.get(w.week.id)!.join("; ")}` : `skipped: ${STATUS[w.week.status] ?? w.week.status}` }));
  const outside = (a.weekIds?.length ?? 0) - all.length + fresh.filter((p) => !p.ok).length;
  const started = newcomers.map((p): CardLine => ({ label: p.name, value: `Not started${ago(p.userId)}` }));
  return { title, lines: [...go.map(line), ...started, ...skip, ...(outside ? [{ label: "Skipped", value: `${outside} you can't act on` }] : [])] };
};
