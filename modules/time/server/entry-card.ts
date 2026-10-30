import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { getProjectRef } from "@amax/delivery/contracts";
import { dayLabel, isoWeekOf, isWeekend } from "../week";
import { refuse, storedEntry, type StoredEntry } from "./card";
import { entityOf } from "./chain";
import { lockRefusal, possibleDuplicate, workDay } from "./guards";
import { allocationRefusal, dateRefusal } from "./rules";
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

// 073: the card says whose record it is, and the For line then repeats nothing.
const whose = (e: StoredEntry) => (e.own ? "for you" : `for ${e.personName}`);

type Fix = { entryId: string; hours?: number; billable?: boolean; note?: string; projectKey?: string; reason?: string };

export async function correctCard(v: Viewer, a: Fix): Promise<ToolCard> {
  const e = await storedEntry(v, a.entryId);
  const moved = a.projectKey ? (await read(v, (tx) => getProjectRef(tx, a.projectKey!)))?.name ?? a.projectKey : e.projectName;
  const { head, tail } = forOther(e, a.reason);
  const look = { kind: "Fix hours", figure: h(a.hours ?? e.hours), subject: moved, detail: dayLabel(e.day), who: whose(e), confirm: "Save the fix", done: `Saved the fix · ${moved}, ${dayLabel(e.day)}` };
  return { title: `Fix ${e.projectName}, ${dayLabel(e.day)}`, look, lines: [...head,
    ...change("Hours", h(e.hours), h(a.hours ?? e.hours)), ...change("Billable", yesNo(e.billable), yesNo(a.billable ?? e.billable)),
    ...change("Note", e.note ?? "none", a.note ?? e.note ?? "none"), ...change("Project", e.projectName, moved), ...tail] };
}

export async function deleteCard(v: Viewer, a: { entryId: string; reason?: string }): Promise<ToolCard> {
  const e = await storedEntry(v, a.entryId);
  const { head, tail } = forOther(e, a.reason);
  return { title: `Remove ${e.projectName}, ${dayLabel(e.day)}: ${h(e.hours)}`, lines: [...head, ...tail],
    look: { kind: "Remove hours", figure: h(e.hours), subject: e.projectName, detail: dayLabel(e.day), who: whose(e), confirm: `Remove ${h(e.hours)}`, tone: "danger", done: `Removed ${h(e.hours)} · ${e.projectName}, ${dayLabel(e.day)}` } };
}

type Log = { projectKey: string; hours: number; day: string; billable?: boolean; note?: string; weekend?: boolean };

export async function logCard(v: Viewer, a: Log): Promise<ToolCard> {
  const { name, twin } = await read(v, async (tx) => {
    const p = await getProjectRef(tx, a.projectKey);
    return { name: p?.name ?? a.projectKey, twin: p ? await possibleDuplicate(tx, v.userId, p.id, a.day, a.note) : null };
  });
  const warn = twin ? [{ label: "Already logged", value: `${name}, ${dayLabel(a.day)}, ${h(twin.hours)}, same note` }] : [];
  const look = { kind: "Log time", figure: h(a.hours), subject: name, detail: `${dayLabel(a.day)}${isWeekend(a.day) ? " · weekend" : ""}`, who: "for you", confirm: `Log ${h(a.hours)}`, done: `Logged ${h(a.hours)} · ${name}, ${dayLabel(a.day)}` };
  return { title: `Log ${h(a.hours)} to ${name}, ${dayLabel(a.day)}${isWeekend(a.day) ? " (weekend)" : ""}`, look,
    lines: [...(a.billable === false ? [{ label: "Billable", value: "no" }] : []), ...(a.note ? [{ label: "Note", value: a.note }] : []), ...warn] };
}

/** Amendment 2: no log card for a weekend, or for a week the viewer can't add to now (009's lock rule). */
export async function proposeLog(v: Viewer, a: Log) {
  let w;
  try { w = isoWeekOf(workDay(a.day, a.weekend)); } catch (e) { return refuse((e as Error).message); }
  const { week, entity } = await read(v, async (tx) => ({ entity: await entityOf(tx, v.userId),
    week: (await tx.execute(sql`select * from time.week where user_id = ${v.userId} and iso_year = ${w.year} and iso_week = ${w.week}`))[0] }));
  const refused = week && lockRefusal(week as WeekRow, v, entity);
  if (refused) refuse(refused);
  // 071 AC-10/AC-11: no card that the entry rules would refuse; chat says why (and which projects are allowed).
  const rule = await read(v, async (tx) => {
    const p = await getProjectRef(tx, a.projectKey);
    return p ? (await allocationRefusal(tx, v.tenantId, v.userId, p.id, a.day)) ?? (await dateRefusal(tx, v.userId, a.day)) : null;
  });
  if (rule) refuse(rule);
}
