import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { getProjectRef } from "@amax/delivery/contracts";
import { dayLabel, isoWeekOf } from "../week";
import { refuse, storedEntry, type StoredEntry } from "./card";
import { lockRefusal, workDay } from "./guards";
import { read } from "./read";
import type { WeekRow } from "./weeks";

// 070 amendment 2: confirm cards in the person's words, read from the stored entry.
const h = (n: number) => `${Number(n.toFixed(2))} h`;
const yesNo = (b: boolean) => (b ? "yes" : "no");
const change = (label: string, before: string, after: string): CardLine[] => (before === after ? [] : [{ label, value: `${before} → ${after}` }]);

function forOther(e: StoredEntry, reason: string | undefined): { head: CardLine[]; tail: CardLine[] } {
  const why = reason ? [{ label: "Reason", value: reason }] : [];
  if (e.own) return { head: [], tail: why };
  return { head: [{ label: "For", value: e.personName }], tail: [...why, { label: "Notice", value: `${e.personName.split(" ")[0]} will be notified` }] };
}

type Fix = { entryId: string; hours?: number; billable?: boolean; note?: string; projectKey?: string; reason?: string };

export async function correctCard(v: Viewer, a: Fix): Promise<ToolCard> {
  const e = await storedEntry(v, a.entryId);
  const moved = a.projectKey ? (await read(v, (tx) => getProjectRef(tx, a.projectKey!)))?.name ?? a.projectKey : e.projectName;
  const { head, tail } = forOther(e, a.reason);
  return { title: `Fix ${e.projectName}, ${dayLabel(e.day)}`, lines: [...head,
    ...change("Hours", h(e.hours), h(a.hours ?? e.hours)), ...change("Billable", yesNo(e.billable), yesNo(a.billable ?? e.billable)),
    ...change("Note", e.note ?? "none", a.note ?? e.note ?? "none"), ...change("Project", e.projectName, moved), ...tail] };
}

export async function deleteCard(v: Viewer, a: { entryId: string; reason?: string }): Promise<ToolCard> {
  const e = await storedEntry(v, a.entryId);
  const { head, tail } = forOther(e, a.reason);
  return { title: `Remove ${e.projectName}, ${dayLabel(e.day)}: ${h(e.hours)}`, lines: [...head, ...tail] };
}

type Log = { projectKey: string; hours: number; day: string; billable?: boolean; note?: string };

export async function logCard(v: Viewer, a: Log): Promise<ToolCard> {
  const name = (await read(v, (tx) => getProjectRef(tx, a.projectKey)))?.name ?? a.projectKey;
  return { title: `Log ${h(a.hours)} to ${name}, ${dayLabel(a.day)}`,
    lines: [...(a.billable === false ? [{ label: "Billable", value: "no" }] : []), ...(a.note ? [{ label: "Note", value: a.note }] : [])] };
}

/** Amendment 2: no log card for a weekend, or for a week the viewer can't add to now (009's lock rule). */
export async function proposeLog(v: Viewer, a: Log) {
  let w;
  try { w = isoWeekOf(workDay(a.day)); } catch (e) { return refuse((e as Error).message); }
  const [week] = await read(v, (tx) => tx.execute(sql`select * from time.week where user_id = ${v.userId} and iso_year = ${w.year} and iso_week = ${w.week}`));
  const refused = week && lockRefusal(week as WeekRow, v);
  if (refused) refuse(refused);
}
